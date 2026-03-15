// Requirements: sandbox-http-request.2, sandbox-http-request.3, sandbox-http-request.4

import {
  HTTP_REQUEST_LIMITS,
  SandboxHttpRequestHandler,
} from '../../../src/main/code_exec/SandboxHttpRequestHandler';

function makeResponse(
  body: string | Uint8Array,
  init: { status: number; headers?: Record<string, string>; url?: string }
): Response {
  const bytes = typeof body === 'string' ? Uint8Array.from(Buffer.from(body, 'utf8')) : body;
  const headerEntries = Object.entries(init.headers ?? {});
  const headers = {
    get(name: string) {
      const match = headerEntries.find(([key]) => key.toLowerCase() === name.toLowerCase());
      return match ? match[1] : null;
    },
    entries() {
      return headerEntries[Symbol.iterator]();
    },
  };
  const reader = {
    index: 0,
    async read() {
      if (this.index > 0) {
        return { done: true, value: undefined };
      }
      this.index += 1;
      return { done: false, value: bytes };
    },
    async cancel() {
      this.index = 1;
    },
  };

  return {
    status: init.status,
    headers,
    url: init.url ?? '',
    body: {
      getReader: () => reader,
    },
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  } as unknown as Response;
}

describe('SandboxHttpRequestHandler', () => {
  /* Preconditions: handler receives minimal valid input without optional fields
     Action: execute http_request with only url
     Assertions: fetch uses default GET/manual redirect/no body and success result is returned
     Requirements: sandbox-http-request.2.1, sandbox-http-request.2.4, sandbox-http-request.2.7, sandbox-http-request.2.8, sandbox-http-request.3.4 */
  it('uses default GET, timeout, manual redirect mode, and no body when optional fields are omitted', async () => {
    const fetchMock = jest.fn(async () =>
      makeResponse('ok', {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
        url: 'https://example.com/data',
      })
    ) as unknown as typeof fetch;
    const handler = new SandboxHttpRequestHandler(fetchMock);

    const result = await handler.execute({ url: 'https://example.com/data' });

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/data', {
      method: 'GET',
      headers: undefined,
      body: undefined,
      redirect: 'manual',
      signal: expect.any(AbortSignal),
    });
    expect(result).toMatchObject({
      status: 200,
      final_url: 'https://example.com/data',
      body: 'ok',
      body_encoding: 'text',
      applied_limit_bytes: HTTP_REQUEST_LIMITS.responseBytesHardCap,
    });
  });

  /* Preconditions: handler receives invalid method, headers, body, and timeout values
     Action: execute helper with invalid input shapes
     Assertions: helper returns structured validation errors for each invalid argument
     Requirements: sandbox-http-request.2.4.2, sandbox-http-request.2.5.1, sandbox-http-request.2.6.1, sandbox-http-request.2.6.2, sandbox-http-request.2.7.1, sandbox-http-request.4.1 */
  it('rejects invalid method, headers, body, and timeout', async () => {
    const handler = new SandboxHttpRequestHandler(jest.fn() as unknown as typeof fetch);

    await expect(
      handler.execute({ url: 'https://example.com', method: 'TRACE' })
    ).resolves.toMatchObject({ error: { code: 'invalid_method' } });
    await expect(
      handler.execute({
        url: 'https://example.com',
        headers: { accept: 1 },
      })
    ).resolves.toMatchObject({ error: { code: 'invalid_headers' } });
    await expect(
      handler.execute({
        url: 'https://example.com',
        method: 'GET',
        body: 'not allowed',
      })
    ).resolves.toMatchObject({ error: { code: 'invalid_body' } });
    await expect(
      handler.execute({
        url: 'https://example.com',
        timeout_ms: HTTP_REQUEST_LIMITS.timeoutMsMax + 1,
      })
    ).resolves.toMatchObject({ error: { code: 'invalid_timeout' } });
  });

  /* Preconditions: handler receives invalid url, follow_redirects, and max_response_bytes values
     Action: execute helper with invalid optional argument values
     Assertions: helper returns structured validation errors for each invalid argument
     Requirements: sandbox-http-request.2.3, sandbox-http-request.2.8, sandbox-http-request.2.9, sandbox-http-request.4.1 */
  it('rejects invalid url, follow_redirects, and max_response_bytes', async () => {
    const handler = new SandboxHttpRequestHandler(jest.fn() as unknown as typeof fetch);

    await expect(handler.execute({ url: '/relative' })).resolves.toMatchObject({
      error: { code: 'invalid_url' },
    });
    await expect(
      handler.execute({
        url: 'https://example.com',
        follow_redirects: 'yes',
      })
    ).resolves.toMatchObject({ error: { code: 'invalid_follow_redirects' } });
    await expect(
      handler.execute({
        url: 'https://example.com',
        max_response_bytes: -1,
      })
    ).resolves.toMatchObject({ error: { code: 'invalid_max_response_bytes' } });
  });

  /* Preconditions: handler receives redirect response and follow_redirects is false
     Action: execute helper against redirecting endpoint
     Assertions: helper returns first redirect response without following Location
     Requirements: sandbox-http-request.3.3.3, sandbox-http-request.3.4 */
  it('returns redirect response without following when follow_redirects is false', async () => {
    const fetchMock = jest.fn(async () =>
      makeResponse('', {
        status: 302,
        headers: { location: 'https://example.com/next' },
      })
    ) as unknown as typeof fetch;
    const handler = new SandboxHttpRequestHandler(fetchMock);

    const result = await handler.execute({
      url: 'https://example.com/start',
      follow_redirects: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 302,
      final_url: 'https://example.com/start',
      truncated: false,
      applied_limit_bytes: HTTP_REQUEST_LIMITS.responseBytesHardCap,
    });
  });

  /* Preconditions: handler receives a redirect chain with follow_redirects enabled
     Action: execute helper against redirecting endpoint
     Assertions: helper follows redirects and returns the final resolved URL with body
     Requirements: sandbox-http-request.3.3, sandbox-http-request.3.4 */
  it('follows redirects and returns the final resolved URL', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        makeResponse('', {
          status: 302,
          headers: { location: 'https://example.com/next' },
        })
      )
      .mockResolvedValueOnce(
        makeResponse('ok', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        })
      );
    const handler = new SandboxHttpRequestHandler(fetchMock as unknown as typeof fetch);

    const result = await handler.execute({
      url: 'https://example.com/start',
      follow_redirects: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      status: 200,
      final_url: 'https://example.com/next',
      body: 'ok',
      body_encoding: 'text',
      applied_limit_bytes: HTTP_REQUEST_LIMITS.responseBytesHardCap,
    });
  });

  /* Preconditions: redirect response uses a relative Location header
     Action: execute helper with follow_redirects enabled
     Assertions: helper resolves the relative redirect against the current request URL
     Requirements: sandbox-http-request.3.3, sandbox-http-request.3.4 */
  it('resolves relative redirect locations against the current URL', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        makeResponse('', {
          status: 301,
          headers: { location: '/next' },
        })
      )
      .mockResolvedValueOnce(
        makeResponse('done', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
          url: 'https://example.com/next',
        })
      );
    const handler = new SandboxHttpRequestHandler(fetchMock as unknown as typeof fetch);

    const result = await handler.execute({
      url: 'https://example.com/start',
      follow_redirects: true,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.com/next',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result).toMatchObject({
      status: 200,
      final_url: 'https://example.com/next',
      body: 'done',
    });
  });

  /* Preconditions: redirecting POST request receives 302 before final response
     Action: execute helper with POST body and follow_redirects enabled
     Assertions: helper rewrites redirected request to GET without a body, matching fetch semantics
     Requirements: sandbox-http-request.2.1, sandbox-http-request.3.3 */
  it('rewrites POST redirects to GET without body for 302 responses', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        makeResponse('', {
          status: 302,
          headers: { location: 'https://example.com/next' },
        })
      )
      .mockResolvedValueOnce(
        makeResponse('done', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
          url: 'https://example.com/next',
        })
      );
    const handler = new SandboxHttpRequestHandler(fetchMock as unknown as typeof fetch);

    const result = await handler.execute({
      url: 'https://example.com/start',
      method: 'POST',
      body: 'payload',
      follow_redirects: true,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.com/next',
      expect.objectContaining({
        method: 'GET',
        body: undefined,
        headers: undefined,
      })
    );
    expect(result).toMatchObject({
      status: 200,
      body: 'done',
    });
  });

  /* Preconditions: redirecting POST request receives 301 before final response
     Action: execute helper with POST body and follow_redirects enabled
     Assertions: helper rewrites redirected request to GET without a body for 301 responses
     Requirements: sandbox-http-request.3.3.5 */
  it('rewrites POST redirects to GET without body for 301 responses', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        makeResponse('', {
          status: 301,
          headers: { location: 'https://example.com/next' },
        })
      )
      .mockResolvedValueOnce(
        makeResponse('done', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
          url: 'https://example.com/next',
        })
      );
    const handler = new SandboxHttpRequestHandler(fetchMock as unknown as typeof fetch);

    await handler.execute({
      url: 'https://example.com/start',
      method: 'POST',
      body: 'payload',
      follow_redirects: true,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.com/next',
      expect.objectContaining({
        method: 'GET',
        body: undefined,
        headers: undefined,
      })
    );
  });

  /* Preconditions: redirect response uses status 303 with a non-GET method and body-specific headers
     Action: execute helper with follow_redirects enabled
     Assertions: helper rewrites the next hop to GET without body and strips body-specific headers
     Requirements: sandbox-http-request.3.3.4, sandbox-http-request.3.3.6.1 */
  it('rewrites 303 redirects to GET and strips body-specific headers', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        makeResponse('', {
          status: 303,
          headers: { location: 'https://example.com/next' },
        })
      )
      .mockResolvedValueOnce(
        makeResponse('done', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
          url: 'https://example.com/next',
        })
      );
    const handler = new SandboxHttpRequestHandler(fetchMock as unknown as typeof fetch);

    await handler.execute({
      url: 'https://example.com/start',
      method: 'PUT',
      body: 'payload',
      headers: {
        'content-type': 'application/json',
        'content-length': '7',
        accept: 'text/plain',
      },
      follow_redirects: true,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.com/next',
      expect.objectContaining({
        method: 'GET',
        body: undefined,
        headers: { accept: 'text/plain' },
      })
    );
  });

  /* Preconditions: redirect response uses status 307 with a non-GET method and request body
     Action: execute helper with follow_redirects enabled
     Assertions: helper preserves method, body, and body-specific headers for the next hop
     Requirements: sandbox-http-request.3.3.6 */
  it('preserves method, body, and headers for 307 redirects', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        makeResponse('', {
          status: 307,
          headers: { location: 'https://example.com/next' },
        })
      )
      .mockResolvedValueOnce(
        makeResponse('done', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
          url: 'https://example.com/next',
        })
      );
    const handler = new SandboxHttpRequestHandler(fetchMock as unknown as typeof fetch);

    await handler.execute({
      url: 'https://example.com/start',
      method: 'PATCH',
      body: 'payload',
      headers: {
        'content-type': 'application/json',
        'content-length': '7',
      },
      follow_redirects: true,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.com/next',
      expect.objectContaining({
        method: 'PATCH',
        body: 'payload',
        headers: {
          'content-type': 'application/json',
          'content-length': '7',
        },
      })
    );
  });

  /* Preconditions: redirect response uses status 308 with a non-GET method and request body
     Action: execute helper with follow_redirects enabled
     Assertions: helper preserves method, body, and body-specific headers for the next hop
     Requirements: sandbox-http-request.3.3.6 */
  it('preserves method, body, and headers for 308 redirects', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        makeResponse('', {
          status: 308,
          headers: { location: 'https://example.com/next' },
        })
      )
      .mockResolvedValueOnce(
        makeResponse('done', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
          url: 'https://example.com/next',
        })
      );
    const handler = new SandboxHttpRequestHandler(fetchMock as unknown as typeof fetch);

    await handler.execute({
      url: 'https://example.com/start',
      method: 'PUT',
      body: 'payload',
      headers: {
        'content-type': 'application/json',
        'content-length': '7',
      },
      follow_redirects: true,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.com/next',
      expect.objectContaining({
        method: 'PUT',
        body: 'payload',
        headers: {
          'content-type': 'application/json',
          'content-length': '7',
        },
      })
    );
  });

  /* Preconditions: redirect chain crosses to a different origin with sensitive headers attached
     Action: execute helper with follow_redirects enabled across origins
     Assertions: next hop strips sensitive headers before issuing the redirected request
     Requirements: sandbox-http-request.3.3.7, sandbox-http-request.4.4 */
  it('strips sensitive headers on cross-origin redirects', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        makeResponse('', {
          status: 302,
          headers: { location: 'https://other.example.com/next' },
        })
      )
      .mockResolvedValueOnce(
        makeResponse('done', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
          url: 'https://other.example.com/next',
        })
      );
    const handler = new SandboxHttpRequestHandler(fetchMock as unknown as typeof fetch);

    const result = await handler.execute({
      url: 'https://example.com/start',
      headers: {
        authorization: 'Bearer secret',
        cookie: 'session=abc',
        'proxy-authorization': 'Basic secret',
        accept: 'text/plain',
      },
      follow_redirects: true,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://other.example.com/next',
      expect.objectContaining({
        headers: { accept: 'text/plain' },
      })
    );
    expect(result).toMatchObject({
      status: 200,
      body: 'done',
    });
  });

  /* Preconditions: redirect chain stays on the same origin with caller-supplied headers
     Action: execute helper with follow_redirects enabled on same-origin redirect
     Assertions: next hop preserves request headers
     Requirements: sandbox-http-request.3.3, sandbox-http-request.4.4 */
  it('preserves headers on same-origin redirects', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        makeResponse('', {
          status: 302,
          headers: { location: '/next' },
        })
      )
      .mockResolvedValueOnce(
        makeResponse('done', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
          url: 'https://example.com/next',
        })
      );
    const handler = new SandboxHttpRequestHandler(fetchMock as unknown as typeof fetch);

    await handler.execute({
      url: 'https://example.com/start',
      headers: {
        authorization: 'Bearer secret',
        accept: 'text/plain',
      },
      follow_redirects: true,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.com/next',
      expect.objectContaining({
        headers: {
          authorization: 'Bearer secret',
          accept: 'text/plain',
        },
      })
    );
  });

  /* Preconditions: handler receives redirect loop longer than the allowed hop count
     Action: execute helper with follow_redirects enabled
     Assertions: helper returns structured fetch_failed error after redirect limit is exceeded
     Requirements: sandbox-http-request.3.3.1, sandbox-http-request.3.3.2, sandbox-http-request.4.2 */
  it('returns fetch_failed when redirect hop limit is exceeded', async () => {
    const fetchMock = jest.fn(async () =>
      makeResponse('', {
        status: 302,
        headers: { location: 'https://example.com/loop' },
      })
    ) as unknown as typeof fetch;
    const handler = new SandboxHttpRequestHandler(fetchMock);

    const result = await handler.execute({
      url: 'https://example.com/start',
      follow_redirects: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(HTTP_REQUEST_LIMITS.redirectHopsMax + 1);
    expect(result).toMatchObject({
      error: {
        code: 'fetch_failed',
        message: expect.stringContaining(String(HTTP_REQUEST_LIMITS.redirectHopsMax)),
      },
    });
  });

  /* Preconditions: handler receives non-text response bytes
     Action: execute helper against binary response
     Assertions: helper returns base64-encoded body for binary content
     Requirements: sandbox-http-request.3.4.4, sandbox-http-request.3.4.6 */
  it('returns base64 body for non-text responses', async () => {
    const bytes = Uint8Array.from([0, 1, 2, 3]);
    const fetchMock = jest.fn(async () =>
      makeResponse(bytes, {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      })
    ) as unknown as typeof fetch;
    const handler = new SandboxHttpRequestHandler(fetchMock);

    const result = await handler.execute({
      url: 'https://example.com/file.bin',
    });

    expect(result).toMatchObject({
      status: 200,
      body_encoding: 'base64',
      body: Buffer.from(bytes).toString('base64'),
      applied_limit_bytes: HTTP_REQUEST_LIMITS.responseBytesHardCap,
    });
  });

  /* Preconditions: helper receives explicit max_response_bytes smaller than response body
     Action: execute helper against text response with explicit byte limit
     Assertions: response body is truncated and applied_limit_bytes reflects the explicit limit
     Requirements: sandbox-http-request.2.9, sandbox-http-request.2.10, sandbox-http-request.3.5, sandbox-http-request.3.6 */
  it('applies max_response_bytes and marks result as truncated', async () => {
    const fetchMock = jest.fn(async () =>
      makeResponse('hello world', {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    ) as unknown as typeof fetch;
    const handler = new SandboxHttpRequestHandler(fetchMock);

    const result = await handler.execute({
      url: 'https://example.com',
      max_response_bytes: 5,
    });

    expect(result).toMatchObject({
      status: 200,
      body_encoding: 'text',
      body: 'hello',
      truncated: true,
      applied_limit_bytes: 5,
    });
  });

  /* Preconditions: helper receives response body larger than internal safety cap and no explicit max_response_bytes
     Action: execute helper against oversized text response
     Assertions: body reading stays bounded by the hard cap and result is marked truncated
     Requirements: sandbox-http-request.3.5, sandbox-http-request.3.6, sandbox-http-request.4.4 */
  it('applies the internal hard cap when max_response_bytes is omitted', async () => {
    const oversizedBody = 'x'.repeat(HTTP_REQUEST_LIMITS.responseBytesHardCap + 128);
    const fetchMock = jest.fn(async () =>
      makeResponse(oversizedBody, {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    ) as unknown as typeof fetch;
    const handler = new SandboxHttpRequestHandler(fetchMock);

    const result = await handler.execute({
      url: 'https://example.com',
    });

    expect(result).toMatchObject({
      status: 200,
      truncated: true,
      applied_limit_bytes: HTTP_REQUEST_LIMITS.responseBytesHardCap,
    });
    expect('body' in result && result.body.length).toBe(HTTP_REQUEST_LIMITS.responseBytesHardCap);
  });

  /* Preconditions: helper receives max_response_bytes larger than the supported hard cap
     Action: execute helper with oversized explicit byte limit
     Assertions: helper returns structured invalid_max_response_bytes validation error
     Requirements: sandbox-http-request.2.9, sandbox-http-request.4.1 */
  it('rejects max_response_bytes above the hard cap', async () => {
    const handler = new SandboxHttpRequestHandler(jest.fn() as unknown as typeof fetch);

    const result = await handler.execute({
      url: 'https://example.com',
      max_response_bytes: HTTP_REQUEST_LIMITS.responseBytesHardCap + 1,
    });

    expect(result).toMatchObject({
      error: { code: 'invalid_max_response_bytes' },
    });
  });

  /* Preconditions: underlying fetch throws runtime error
     Action: execute helper against failing fetch implementation
     Assertions: helper returns structured fetch_failed runtime error
     Requirements: sandbox-http-request.4.2 */
  it('returns fetch_failed when underlying fetch throws', async () => {
    const fetchMock = jest.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const handler = new SandboxHttpRequestHandler(fetchMock);

    const result = await handler.execute({
      url: 'https://example.com',
    });

    expect(result).toMatchObject({
      error: {
        code: 'fetch_failed',
        message: 'network down',
      },
    });
  });
});
