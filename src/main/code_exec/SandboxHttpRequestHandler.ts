// Requirements: sandbox-http-request.2, sandbox-http-request.3, sandbox-http-request.4

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
  | 'limit_exceeded'
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
  applied_limit_bytes?: number;
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

function defaultFetch(...args: Parameters<FetchLike>): ReturnType<FetchLike> {
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('fetch is not available in this runtime.');
  }

  return globalThis.fetch(...args);
}

// Requirements: sandbox-http-request.2, sandbox-http-request.3, sandbox-http-request.4
export class SandboxHttpRequestHandler {
  constructor(private readonly fetchImpl: FetchLike = defaultFetch as FetchLike) {}

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
        rawMaxResponseBytes < 0
      ) {
        return this.validationError(
          'invalid_max_response_bytes',
          'http_request.max_response_bytes must be a non-negative integer.'
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

    try {
      let currentUrl = input.url;
      let redirectHops = 0;

      for (;;) {
        const response = await this.fetchImpl(currentUrl, {
          method: input.method,
          headers: input.headers,
          body: input.body,
          redirect: 'manual',
          signal: controller.signal,
        });

        if (!input.followRedirects) {
          return await this.buildSuccessResult(currentUrl, response, input.maxResponseBytes);
        }

        if (!this.isRedirectResponse(response.status)) {
          return await this.buildSuccessResult(currentUrl, response, input.maxResponseBytes);
        }

        const location = response.headers.get('location');
        if (!location) {
          return await this.buildSuccessResult(currentUrl, response, input.maxResponseBytes);
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

        currentUrl = new URL(location, currentUrl).toString();
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
    maxResponseBytes?: number
  ): Promise<SandboxHttpRequestSuccess> {
    const contentType = response.headers.get('content-type') ?? '';
    const headers = Object.fromEntries(response.headers.entries());
    const bodyBytesResult = await this.readBodyBytes(response, maxResponseBytes);
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
      ...(maxResponseBytes !== undefined ? { applied_limit_bytes: maxResponseBytes } : {}),
    };
  }

  // Requirements: sandbox-http-request.3.5
  private async readBodyBytes(
    response: Response,
    maxResponseBytes?: number
  ): Promise<{ bytes: Uint8Array; truncated: boolean }> {
    if (response.body === null) {
      return { bytes: new Uint8Array(0), truncated: false };
    }

    if (maxResponseBytes === undefined) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { bytes, truncated: false };
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
      const remaining = maxResponseBytes - totalBytes;
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
}
