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
    });
  });

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
    });
  });

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
    });
  });

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
    });
  });

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
