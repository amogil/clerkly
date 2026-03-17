// Requirements: sandbox-http-request.2, sandbox-http-request.3, sandbox-http-request.4

import { lookup as dnsLookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

const ALLOWED_HTTP_METHODS = new Set<HttpMethod>([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

export const HTTP_REQUEST_LIMITS = {
  timeoutMsDefault: 10_000,
  timeoutMsMax: 180_000,
  redirectHopsMax: 10,
  responseBytesHardCap: 256 * 1024,
} as const;

export type SandboxHttpRequestValidationErrorCode =
  | 'invalid_url'
  | 'invalid_method'
  | 'invalid_headers'
  | 'invalid_body'
  | 'invalid_timeout'
  | 'invalid_follow_redirects'
  | 'invalid_max_response_bytes';

export type SandboxHttpRequestRuntimeErrorCode =
  | 'fetch_failed'
  | 'forbidden_destination'
  | 'internal_error';

export interface SandboxHttpRequestError {
  error: {
    code: SandboxHttpRequestValidationErrorCode | SandboxHttpRequestRuntimeErrorCode;
    message: string;
  };
}

export interface SandboxHttpRequestSuccess {
  status: number;
  final_url: string;
  headers: Record<string, string>;
  content_type: string;
  body_encoding: 'text' | 'base64';
  body: string;
  truncated: boolean;
  applied_limit_bytes: number;
}

export type SandboxHttpRequestResult = SandboxHttpRequestSuccess | SandboxHttpRequestError;

interface ValidatedHttpRequestInput {
  url: string;
  method: HttpMethod;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
  followRedirects: boolean;
  maxResponseBytes?: number;
}

type FetchLike = typeof fetch;
type HostLookupResult = { address: string; family: number };
type HostLookup = (hostname: string) => Promise<HostLookupResult[]>;
type BoundTransport = (
  destination: ValidatedDestination,
  init: { method: HttpMethod; headers?: Record<string, string>; body?: string; signal: AbortSignal }
) => Promise<Response>;

interface ValidatedDestination {
  url: string;
  hostname: string;
  address: string;
  family: number;
}

interface ValidatedDestinationPlan {
  url: string;
  hostname: string;
  addresses: HostLookupResult[];
}
const CROSS_ORIGIN_STRIPPED_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'cookie2',
]);
const REWRITTEN_GET_STRIPPED_HEADERS = new Set([
  'content-type',
  'content-length',
  'content-encoding',
  'transfer-encoding',
]);
const FORBIDDEN_REQUEST_HEADERS = new Set([
  'host',
  'content-length',
  'connection',
  'proxy-connection',
  'transfer-encoding',
  'upgrade',
  'keep-alive',
  'te',
  'trailer',
  'expect',
]);
const FORBIDDEN_DESTINATION_MESSAGE =
  'http_request cannot access localhost, loopback, private, link-local, or reserved internal network targets.';
const RETRYABLE_CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EADDRNOTAVAIL',
  'ETIMEDOUT',
]);

// Requirements: sandbox-http-request.2.3.1, sandbox-http-request.3.3.8
function defaultLookup(hostname: string): Promise<HostLookupResult[]> {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

// Requirements: sandbox-http-request.3.2.1, sandbox-http-request.3.2.2
function isRetryableConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = 'code' in error ? error.code : undefined;
  return typeof code === 'string' && RETRYABLE_CONNECTION_ERROR_CODES.has(code);
}

// Requirements: sandbox-http-request.2.3.1, sandbox-http-request.3.2, sandbox-http-request.3.3.8
function defaultBoundTransport(
  destination: ValidatedDestination,
  init: { method: HttpMethod; headers?: Record<string, string>; body?: string; signal: AbortSignal }
): Promise<Response> {
  const parsed = new URL(destination.url);
  const isHttps = parsed.protocol === 'https:';
  const requestImpl = isHttps ? https.request : http.request;
  const headers = new Headers(init.headers);

  if (!headers.has('host')) {
    headers.set('host', parsed.host);
  }

  return new Promise<Response>((resolve, reject) => {
    const request = requestImpl(
      {
        protocol: parsed.protocol,
        hostname: destination.address,
        port: parsed.port ? Number(parsed.port) : undefined,
        method: init.method,
        path: `${parsed.pathname}${parsed.search}`,
        headers: Object.fromEntries(headers.entries()),
        signal: init.signal,
        servername: isHttps ? destination.hostname : undefined,
        family: destination.family,
      },
      (response) => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) {
            for (const entry of value) {
              responseHeaders.append(name, entry);
            }
            continue;
          }
          if (typeof value === 'string') {
            responseHeaders.set(name, value);
          }
        }

        resolve(
          new Response(Readable.toWeb(response) as ReadableStream<Uint8Array>, {
            status: response.statusCode ?? 0,
            headers: responseHeaders,
          })
        );
      }
    );

    request.on('error', reject);
    if (typeof init.body === 'string' && init.body.length > 0) {
      request.write(init.body);
    }
    request.end();
  });
}

// Requirements: sandbox-http-request.2, sandbox-http-request.3, sandbox-http-request.4
export class SandboxHttpRequestHandler {
  constructor(
    private readonly fetchImpl?: FetchLike,
    private readonly lookupImpl: HostLookup = defaultLookup,
    private readonly allowedLoopbackHosts = new Set<string>(),
    private readonly transportImpl: BoundTransport = defaultBoundTransport
  ) {}

  // Requirements: sandbox-http-request.2, sandbox-http-request.3, sandbox-http-request.4
  async execute(args: unknown): Promise<SandboxHttpRequestResult> {
    const validated = this.validateInput(args);
    if ('error' in validated) {
      return validated;
    }

    try {
      return await this.performRequest(validated);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        error: {
          code: 'internal_error',
          message,
        },
      };
    }
  }

  // Requirements: sandbox-http-request.2, sandbox-http-request.4.1
  private validateInput(args: unknown): ValidatedHttpRequestInput | SandboxHttpRequestError {
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return this.validationError('invalid_url', 'http_request expects a single object argument.');
    }

    const raw = args as Record<string, unknown>;
    const url = raw.url;
    if (typeof url !== 'string') {
      return this.validationError('invalid_url', 'http_request.url must be a string.');
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return this.validationError(
        'invalid_url',
        'http_request.url must be an absolute http/https URL.'
      );
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return this.validationError('invalid_url', 'http_request.url must use http or https.');
    }

    const rawMethod = raw.method;
    const method = rawMethod === undefined ? 'GET' : rawMethod;
    if (typeof method !== 'string' || !ALLOWED_HTTP_METHODS.has(method as HttpMethod)) {
      return this.validationError(
        'invalid_method',
        'http_request.method must be one of: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS.'
      );
    }

    const rawHeaders = raw.headers;
    let headers: Record<string, string> | undefined;
    if (rawHeaders !== undefined) {
      if (!rawHeaders || typeof rawHeaders !== 'object' || Array.isArray(rawHeaders)) {
        return this.validationError(
          'invalid_headers',
          'http_request.headers must be an object with string keys and string values.'
        );
      }

      headers = {};
      for (const [key, value] of Object.entries(rawHeaders as Record<string, unknown>)) {
        if (typeof value !== 'string') {
          return this.validationError(
            'invalid_headers',
            'http_request.headers must contain only string values.'
          );
        }
        if (FORBIDDEN_REQUEST_HEADERS.has(key.toLowerCase())) {
          return this.validationError(
            'invalid_headers',
            `http_request.headers must not contain forbidden request-control header "${key}".`
          );
        }
        headers[key] = value;
      }
    }

    const rawBody = raw.body;
    let body: string | undefined;
    if (rawBody !== undefined) {
      if (typeof rawBody !== 'string') {
        return this.validationError('invalid_body', 'http_request.body must be a string.');
      }

      if (method === 'GET' || method === 'HEAD') {
        return this.validationError(
          'invalid_body',
          `http_request.body is not allowed for ${method} requests.`
        );
      }
      body = rawBody;
    }

    const rawTimeout = raw.timeout_ms;
    const timeoutMs = rawTimeout === undefined ? HTTP_REQUEST_LIMITS.timeoutMsDefault : rawTimeout;
    if (
      typeof timeoutMs !== 'number' ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs <= 0 ||
      timeoutMs > HTTP_REQUEST_LIMITS.timeoutMsMax
    ) {
      return this.validationError(
        'invalid_timeout',
        `http_request.timeout_ms must be an integer in range 1..${HTTP_REQUEST_LIMITS.timeoutMsMax}.`
      );
    }

    const rawFollowRedirects = raw.follow_redirects;
    const followRedirects = rawFollowRedirects === undefined ? true : rawFollowRedirects;
    if (typeof followRedirects !== 'boolean') {
      return this.validationError(
        'invalid_follow_redirects',
        'http_request.follow_redirects must be a boolean.'
      );
    }

    const rawMaxResponseBytes = raw.max_response_bytes;
    let maxResponseBytes: number | undefined;
    if (rawMaxResponseBytes !== undefined) {
      if (
        typeof rawMaxResponseBytes !== 'number' ||
        !Number.isInteger(rawMaxResponseBytes) ||
        rawMaxResponseBytes < 0 ||
        rawMaxResponseBytes > HTTP_REQUEST_LIMITS.responseBytesHardCap
      ) {
        return this.validationError(
          'invalid_max_response_bytes',
          `http_request.max_response_bytes must be an integer in range 0..${HTTP_REQUEST_LIMITS.responseBytesHardCap}.`
        );
      }
      maxResponseBytes = rawMaxResponseBytes;
    }

    return {
      url: parsedUrl.toString(),
      method: method as HttpMethod,
      headers,
      body,
      timeoutMs,
      followRedirects,
      maxResponseBytes,
    };
  }

  // Requirements: sandbox-http-request.3, sandbox-http-request.4.2
  private async performRequest(
    input: ValidatedHttpRequestInput
  ): Promise<SandboxHttpRequestResult> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), input.timeoutMs);
    const appliedLimitBytes = input.maxResponseBytes ?? HTTP_REQUEST_LIMITS.responseBytesHardCap;

    try {
      let currentUrl = input.url;
      let currentMethod: HttpMethod = input.method;
      let currentBody = input.body;
      let currentHeaders = input.headers;
      let redirectHops = 0;

      for (;;) {
        const destinationPolicy = await this.validateDestination(currentUrl);
        if ('error' in destinationPolicy) {
          return destinationPolicy;
        }

        const response = this.fetchImpl
          ? await this.fetchImpl(currentUrl, {
              method: currentMethod,
              headers: currentHeaders,
              body: currentBody,
              redirect: 'manual',
              signal: controller.signal,
            })
          : await this.executeBoundRequest(destinationPolicy, {
              method: currentMethod,
              headers: currentHeaders,
              body: currentBody,
              signal: controller.signal,
            });

        if (!input.followRedirects) {
          return await this.buildSuccessResult(currentUrl, response, appliedLimitBytes);
        }

        if (!this.isRedirectResponse(response.status)) {
          return await this.buildSuccessResult(currentUrl, response, appliedLimitBytes);
        }

        const location = response.headers.get('location');
        if (!location) {
          return await this.buildSuccessResult(currentUrl, response, appliedLimitBytes);
        }

        redirectHops += 1;
        if (redirectHops > HTTP_REQUEST_LIMITS.redirectHopsMax) {
          return {
            error: {
              code: 'fetch_failed',
              message: `http_request redirect limit exceeded (${HTTP_REQUEST_LIMITS.redirectHopsMax}).`,
            },
          };
        }

        const nextUrl = new URL(location, currentUrl).toString();
        const nextRequest = this.getRedirectFollowRequest(
          response.status,
          currentMethod,
          currentBody
        );
        currentHeaders = this.getRedirectFollowHeaders(
          currentUrl,
          nextUrl,
          currentHeaders,
          currentMethod,
          nextRequest.method
        );
        currentUrl = nextUrl;
        currentMethod = nextRequest.method;
        currentBody = nextRequest.body;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        error: {
          code: 'fetch_failed',
          message,
        },
      };
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  // Requirements: sandbox-http-request.3.4-3.6
  private async buildSuccessResult(
    requestUrl: string,
    response: Response,
    appliedLimitBytes: number
  ): Promise<SandboxHttpRequestSuccess> {
    const contentType = response.headers.get('content-type') ?? '';
    const headers = Object.fromEntries(response.headers.entries());
    const bodyBytesResult = await this.readBodyBytes(response, appliedLimitBytes);
    const bodyEncoding = this.isTextualContentType(contentType) ? 'text' : 'base64';
    const body =
      bodyEncoding === 'text'
        ? Buffer.from(bodyBytesResult.bytes).toString('utf8')
        : Buffer.from(bodyBytesResult.bytes).toString('base64');

    return {
      status: response.status,
      final_url: response.url || requestUrl,
      headers,
      content_type: contentType,
      body_encoding: bodyEncoding,
      body,
      truncated: bodyBytesResult.truncated,
      applied_limit_bytes: appliedLimitBytes,
    };
  }

  // Requirements: sandbox-http-request.3.5
  private async readBodyBytes(
    response: Response,
    appliedLimitBytes: number
  ): Promise<{ bytes: Uint8Array; truncated: boolean }> {
    if (response.body === null) {
      return { bytes: new Uint8Array(0), truncated: false };
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    let truncated = false;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      const remaining = appliedLimitBytes - totalBytes;
      if (remaining <= 0) {
        truncated = true;
        await reader.cancel();
        break;
      }

      if (chunk.byteLength > remaining) {
        chunks.push(chunk.slice(0, remaining));
        totalBytes += remaining;
        truncated = true;
        await reader.cancel();
        break;
      }

      chunks.push(chunk);
      totalBytes += chunk.byteLength;
    }

    const result = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return { bytes: result, truncated };
  }

  private validationError(
    code: SandboxHttpRequestValidationErrorCode,
    message: string
  ): SandboxHttpRequestError {
    return { error: { code, message } };
  }

  private isRedirectResponse(status: number): boolean {
    return status >= 300 && status < 400;
  }

  // Requirements: sandbox-http-request.3.2.1, sandbox-http-request.3.2.2
  private async executeBoundRequest(
    destinationPlan: ValidatedDestinationPlan,
    init: {
      method: HttpMethod;
      headers?: Record<string, string>;
      body?: string;
      signal: AbortSignal;
    }
  ): Promise<Response> {
    let lastError: unknown;

    for (const addressEntry of destinationPlan.addresses) {
      try {
        return await this.transportImpl(
          {
            url: destinationPlan.url,
            hostname: destinationPlan.hostname,
            address: addressEntry.address,
            family: addressEntry.family,
          },
          init
        );
      } catch (error) {
        lastError = error;
        if (init.signal.aborted) {
          throw error;
        }
        if (!isRetryableConnectionError(error)) {
          throw error;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error(`dns lookup returned no addresses for ${destinationPlan.hostname}`);
  }

  // Requirements: sandbox-http-request.3.3
  private getRedirectFollowRequest(
    status: number,
    method: HttpMethod,
    body: string | undefined
  ): { method: HttpMethod; body: string | undefined } {
    if (status === 303) {
      return { method: 'GET', body: undefined };
    }

    if ((status === 301 || status === 302) && method === 'POST') {
      return { method: 'GET', body: undefined };
    }

    return { method, body };
  }

  // Requirements: sandbox-http-request.3.3
  private getRedirectFollowHeaders(
    currentUrl: string,
    nextUrl: string,
    headers: Record<string, string> | undefined,
    currentMethod: HttpMethod,
    nextMethod: HttpMethod
  ): Record<string, string> | undefined {
    if (!headers) {
      return headers;
    }

    let filteredHeaders = headers;

    if (this.isRedirectRewriteToGet(currentMethod, nextMethod)) {
      filteredHeaders = Object.fromEntries(
        Object.entries(filteredHeaders).filter(
          ([name]) => !REWRITTEN_GET_STRIPPED_HEADERS.has(name.toLowerCase())
        )
      );
    }

    if (this.isCrossOriginRedirect(currentUrl, nextUrl)) {
      filteredHeaders = Object.fromEntries(
        Object.entries(filteredHeaders).filter(
          ([name]) => !CROSS_ORIGIN_STRIPPED_HEADERS.has(name.toLowerCase())
        )
      );
    }

    return Object.keys(filteredHeaders).length > 0 ? filteredHeaders : undefined;
  }

  private isRedirectRewriteToGet(currentMethod: HttpMethod, nextMethod: HttpMethod): boolean {
    return nextMethod === 'GET' && currentMethod !== nextMethod;
  }

  private isCrossOriginRedirect(currentUrl: string, nextUrl: string): boolean {
    return new URL(currentUrl).origin !== new URL(nextUrl).origin;
  }

  private isTextualContentType(contentType: string): boolean {
    const normalized = contentType.toLowerCase();
    return (
      normalized.startsWith('text/') ||
      normalized.startsWith('application/json') ||
      normalized.startsWith('application/xml') ||
      normalized.includes('+json') ||
      normalized.includes('+xml')
    );
  }

  // Requirements: sandbox-http-request.2.3.1, sandbox-http-request.3.2.1, sandbox-http-request.3.2.2, sandbox-http-request.3.3.8, sandbox-http-request.4.2.2
  private async validateDestination(
    url: string
  ): Promise<SandboxHttpRequestError | ValidatedDestinationPlan> {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const normalizedHostname =
      hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;

    if (this.isAllowedLoopbackHost(normalizedHostname)) {
      return {
        url,
        hostname: normalizedHostname,
        addresses: [
          {
            address: normalizedHostname,
            family: isIP(normalizedHostname),
          },
        ],
      };
    }

    if (normalizedHostname === 'localhost' || normalizedHostname.endsWith('.localhost')) {
      return this.runtimeError('forbidden_destination', FORBIDDEN_DESTINATION_MESSAGE);
    }

    const ipFamily = isIP(normalizedHostname);
    if (ipFamily > 0) {
      return this.isForbiddenIpAddress(normalizedHostname)
        ? this.runtimeError('forbidden_destination', FORBIDDEN_DESTINATION_MESSAGE)
        : {
            url,
            hostname: normalizedHostname,
            addresses: [
              {
                address: normalizedHostname,
                family: ipFamily,
              },
            ],
          };
    }

    let resolved: HostLookupResult[];
    try {
      resolved = await this.lookupImpl(normalizedHostname);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.runtimeError('fetch_failed', message);
    }

    if (resolved.some((entry) => this.isForbiddenIpAddress(entry.address))) {
      return this.runtimeError('forbidden_destination', FORBIDDEN_DESTINATION_MESSAGE);
    }

    if (resolved.length === 0) {
      return this.runtimeError(
        'fetch_failed',
        `dns lookup returned no addresses for ${normalizedHostname}`
      );
    }

    return {
      url,
      hostname: normalizedHostname,
      addresses: resolved.map((entry) => ({
        address: entry.address,
        family: entry.family,
      })),
    };
  }

  // Requirements: sandbox-http-request.4.2.1-4.2.2
  private runtimeError(
    code: SandboxHttpRequestRuntimeErrorCode,
    message: string
  ): SandboxHttpRequestError {
    return { error: { code, message } };
  }

  // Requirements: sandbox-http-request.2.3.2
  private isAllowedLoopbackHost(hostname: string): boolean {
    return this.allowedLoopbackHosts.has(hostname);
  }

  // Requirements: sandbox-http-request.2.3.1, sandbox-http-request.3.3.8
  private isForbiddenIpAddress(address: string): boolean {
    return this.isForbiddenIpv4(address) || this.isForbiddenIpv6(address);
  }

  private getIpv4MappedIpv6Address(address: string): string | null {
    const normalized = address.toLowerCase();
    const prefix = '::ffff:';
    if (!normalized.startsWith(prefix)) {
      return null;
    }

    const suffix = normalized.slice(prefix.length);
    if (isIP(suffix) === 4) {
      return suffix;
    }

    const segments = suffix.split(':');
    if (segments.length !== 2) {
      return null;
    }

    const high = Number.parseInt(segments[0] ?? '', 16);
    const low = Number.parseInt(segments[1] ?? '', 16);
    if (
      Number.isNaN(high) ||
      Number.isNaN(low) ||
      high < 0 ||
      high > 0xffff ||
      low < 0 ||
      low > 0xffff
    ) {
      return null;
    }

    return [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff].join('.');
  }

  // Requirements: sandbox-http-request.2.3.1, sandbox-http-request.3.3.8
  private isForbiddenIpv4(address: string): boolean {
    const parts = address.split('.').map((part) => Number.parseInt(part, 10));
    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
      return false;
    }

    const a = parts[0] ?? -1;
    const b = parts[1] ?? -1;
    const c = parts[2] ?? -1;
    const d = parts[3] ?? -1;

    if (a === 0 || a === 10 || a === 127) {
      return true;
    }
    if (a === 169 && b === 254) {
      return true;
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return true;
    }
    if (a === 192 && b === 168) {
      return true;
    }
    if (a === 100 && b >= 64 && b <= 127) {
      return true;
    }
    if (a === 192 && b === 0 && (c === 0 || c === 2)) {
      return true;
    }
    if (a === 198 && (b === 18 || b === 19)) {
      return true;
    }
    if (a === 198 && b === 51 && c === 100) {
      return true;
    }
    if (a === 203 && b === 0 && c === 113) {
      return true;
    }
    if (a >= 224 || (a === 255 && b === 255 && c === 255 && d === 255)) {
      return true;
    }

    return false;
  }

  // Requirements: sandbox-http-request.2.3.1, sandbox-http-request.3.3.8
  private isForbiddenIpv6(address: string): boolean {
    const normalized = address.toLowerCase();
    const mappedIpv4 = this.getIpv4MappedIpv6Address(normalized);
    if (mappedIpv4) {
      return this.isForbiddenIpv4(mappedIpv4);
    }
    return (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('::ffff:127.') ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      normalized.startsWith('fec') ||
      normalized.startsWith('fed') ||
      normalized.startsWith('fee') ||
      normalized.startsWith('fef') ||
      normalized.startsWith('ff') ||
      normalized.startsWith('2001:db8:')
    );
  }
}
