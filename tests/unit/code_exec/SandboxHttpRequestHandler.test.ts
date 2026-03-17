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

// Requirements: sandbox-http-request.2.3.1, sandbox-http-request.3.3.8, sandbox-http-request.4.2.2
function makeLookup(...entries: Array<Array<{ address: string; family: number }>>) {
  const queue = [...entries];
  return jest.fn(async () => queue.shift() ?? []);
}

// Requirements: sandbox-http-request.2.3.1, sandbox-http-request.3.3.8, sandbox-http-request.4.2.2
function makePublicLookup(address = '93.184.216.34', family = 4) {
  return jest.fn(async () => [{ address, family }]);
}

// Requirements: sandbox-http-request.2, sandbox-http-request.3, sandbox-http-request.4
function makeHandler(
  fetchImpl: typeof fetch,
  lookupImpl = makePublicLookup()
): SandboxHttpRequestHandler {
  return new SandboxHttpRequestHandler(fetchImpl, lookupImpl);
}

// Requirements: sandbox-http-request.2.3.1, sandbox-http-request.3.2, sandbox-http-request.3.3.8
function makeTransportHandler(
  transportImpl: ConstructorParameters<typeof SandboxHttpRequestHandler>[3],
  lookupImpl = makePublicLookup()
): SandboxHttpRequestHandler {
  return new SandboxHttpRequestHandler(undefined, lookupImpl, new Set<string>(), transportImpl);
}

describe('SandboxHttpRequestHandler', () => {
  /* Preconditions: handler receives malformed argument shapes and unsupported destination scheme
     Action: execute helper with non-object args, non-string url, ftp protocol, non-object headers, and non-string body
     Assertions: helper returns the corresponding structured validation errors
     Requirements: sandbox-http-request.2.3, sandbox-http-request.2.4.2, sandbox-http-request.2.5.1, sandbox-http-request.2.6.1, sandbox-http-request.4.1 */
  it('rejects malformed arguments before any network call', async () => {
    const handler = new SandboxHttpRequestHandler(jest.fn() as unknown as typeof fetch);

    await expect(handler.execute(null)).resolves.toMatchObject({
      error: { code: 'invalid_url' },
    });
    await expect(handler.execute({ url: 123 })).resolves.toMatchObject({
      error: { code: 'invalid_url' },
    });
    await expect(handler.execute({ url: 'ftp://example.com/data' })).resolves.toMatchObject({
      error: { code: 'invalid_url' },
    });
    await expect(
      handler.execute({ url: 'https://example.com', headers: 'bad' })
    ).resolves.toMatchObject({
      error: { code: 'invalid_headers' },
    });
    await expect(
      handler.execute({
        url: 'https://example.com',
        method: 'POST',
        body: 123,
      })
    ).resolves.toMatchObject({
      error: { code: 'invalid_body' },
    });
  });

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
    const handler = makeHandler(fetchMock);

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

  /* Preconditions: helper receives a localhost target in normal runtime policy without a loopback allowlist
     Action: execute helper against localhost URL
     Assertions: helper rejects the request as forbidden_destination before calling fetch
     Requirements: sandbox-http-request.2.3.1, sandbox-http-request.4.2.2 */
  it('rejects localhost destinations before any request is sent', async () => {
    const fetchMock = jest.fn() as unknown as typeof fetch;
    const handler = makeHandler(fetchMock);

    const result = await handler.execute({
      url: 'http://localhost:3000/data',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      error: {
        code: 'forbidden_destination',
      },
    });
  });

  /* Preconditions: helper receives a private-network target resolved from a hostname
     Action: execute helper against a hostname whose lookup resolves to RFC1918/private space
     Assertions: helper rejects the request as forbidden_destination before calling fetch
     Requirements: sandbox-http-request.2.3.1, sandbox-http-request.4.2.2 */
  it('rejects hostnames that resolve to private network addresses', async () => {
    const fetchMock = jest.fn() as unknown as typeof fetch;
    const lookupMock = makeLookup([{ address: '10.0.0.5', family: 4 }]);
    const handler = new SandboxHttpRequestHandler(fetchMock, lookupMock);

    const result = await handler.execute({
      url: 'https://internal.example.com/data',
    });

    expect(lookupMock).toHaveBeenCalledWith('internal.example.com');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      error: {
        code: 'forbidden_destination',
      },
    });
  });

  /* Preconditions: helper receives a direct RFC1918/private target as a literal IP address
     Action: execute helper against the private IP URL
     Assertions: helper rejects the request as forbidden_destination before calling fetch
     Requirements: sandbox-http-request.2.3.1, sandbox-http-request.4.2.2 */
  it('rejects direct private IP destinations before any request is sent', async () => {
    const fetchMock = jest.fn() as unknown as typeof fetch;
    const handler = makeHandler(fetchMock);

    const result = await handler.execute({
      url: 'http://10.0.0.5/data',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      error: {
        code: 'forbidden_destination',
      },
    });
  });

  /* Preconditions: helper receives a direct public literal IP destination
     Action: execute helper against the public IP URL
     Assertions: helper allows the request to proceed without hostname lookup and returns the fetch result
     Requirements: sandbox-http-request.2.3.1, sandbox-http-request.3.2 */
  it('allows direct public literal IP destinations', async () => {
    const fetchMock = jest.fn(async () =>
      makeResponse('ok', {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
        url: 'http://93.184.216.34/data',
      })
    ) as unknown as typeof fetch;
    const lookupMock = jest.fn();
    const handler = new SandboxHttpRequestHandler(fetchMock, lookupMock);

    const result = await handler.execute({
      url: 'http://93.184.216.34/data',
    });

    expect(lookupMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 200,
      final_url: 'http://93.184.216.34/data',
    });
  });

  /* Preconditions: helper receives multiple reserved or internal literal IP targets
     Action: execute helper against loopback, CGNAT, documentation, multicast, broadcast, and IPv6-reserved destinations
     Assertions: helper rejects each target as forbidden_destination before any network call
     Requirements: sandbox-http-request.2.3.1, sandbox-http-request.4.2.2 */
  it.each([
    'http://127.0.0.1/data',
    'http://100.64.0.1/data',
    'http://192.0.2.1/data',
    'http://198.18.0.1/data',
    'http://198.51.100.1/data',
    'http://203.0.113.1/data',
    'http://224.0.0.1/data',
    'http://255.255.255.255/data',
    'http://[::1]/data',
    'http://[2001:db8::1]/data',
  ])('rejects reserved destination %s before any request is sent', async (url) => {
    const fetchMock = jest.fn() as unknown as typeof fetch;
    const handler = makeHandler(fetchMock);

    const result = await handler.execute({ url });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      error: {
        code: 'forbidden_destination',
      },
    });
  });

  /* Preconditions: helper is configured with a loopback allowlist for functional-test mode
     Action: execute helper against an allowed loopback host
     Assertions: helper allows the request to proceed and returns the fetch result
     Requirements: sandbox-http-request.2.3.2, sandbox-http-request.3.4 */
  it('allows explicitly whitelisted loopback destinations', async () => {
    const fetchMock = jest.fn(async () =>
      makeResponse('ok', {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
        url: 'http://127.0.0.1:3000/data',
      })
    ) as unknown as typeof fetch;
    const handler = new SandboxHttpRequestHandler(
      fetchMock,
      makePublicLookup(),
      new Set(['127.0.0.1'])
    );

    const result = await handler.execute({
      url: 'http://127.0.0.1:3000/data',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 200,
      final_url: 'http://127.0.0.1:3000/data',
    });
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
    const handler = makeHandler(fetchMock);

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
    const handler = makeHandler(fetchMock as unknown as typeof fetch);

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
    const handler = makeHandler(fetchMock as unknown as typeof fetch);

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
    const handler = makeHandler(fetchMock as unknown as typeof fetch);

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

  /* Preconditions: helper receives a redirect response without a Location header and a response with no body stream
     Action: execute helper with follow_redirects enabled
     Assertions: helper returns the redirect response as-is and treats missing body as empty text without crashing
     Requirements: sandbox-http-request.3.3, sandbox-http-request.3.4, sandbox-http-request.3.5 */
  it('returns redirect response as-is when location header is missing and supports null response bodies', async () => {
    const fetchMock = jest.fn(async () => ({
      status: 302,
      headers: {
        get: () => null,
        entries: () => [][Symbol.iterator](),
      },
      url: '',
      body: null,
    })) as unknown as typeof fetch;
    const handler = makeHandler(fetchMock);

    const result = await handler.execute({
      url: 'https://example.com/start',
      follow_redirects: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 302,
      final_url: 'https://example.com/start',
      body: '',
      body_encoding: 'base64',
      truncated: false,
    });
  });

  /* Preconditions: helper resolves a public hostname via DNS lookup
     Action: the lookup implementation throws before any network request
     Assertions: helper surfaces the lookup failure as fetch_failed and does not call fetch
     Requirements: sandbox-http-request.2.3.1, sandbox-http-request.4.2.2 */
  it('returns fetch_failed when hostname lookup fails', async () => {
    const fetchMock = jest.fn() as unknown as typeof fetch;
    const lookupMock = jest.fn(async () => {
      throw new Error('dns lookup failed');
    });
    const handler = new SandboxHttpRequestHandler(fetchMock, lookupMock);

    const result = await handler.execute({
      url: 'https://example.com/data',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      error: {
        code: 'fetch_failed',
        message: 'dns lookup failed',
      },
    });
  });

  /* Preconditions: helper resolves a public hostname via DNS lookup but resolver returns no addresses
     Action: execute helper before any network request is sent
     Assertions: helper returns fetch_failed with a no-addresses message and does not call fetch
     Requirements: sandbox-http-request.2.3.1, sandbox-http-request.4.2.2 */
  it('returns fetch_failed when hostname lookup returns no addresses', async () => {
    const fetchMock = jest.fn() as unknown as typeof fetch;
    const lookupMock = jest.fn(async () => []);
    const handler = new SandboxHttpRequestHandler(fetchMock, lookupMock);

    const result = await handler.execute({
      url: 'https://example.com/data',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      error: {
        code: 'fetch_failed',
        message: 'dns lookup returned no addresses for example.com',
      },
    });
  });

  /* Preconditions: handler runs without injected fetch and receives a public hostname that resolves to one concrete address
     Action: execute helper through the default bound transport path
     Assertions: the runtime transport uses the preflight-validated address as the actual connection target
     Requirements: sandbox-http-request.2.3.1, sandbox-http-request.3.2, sandbox-http-request.4.2.2 */
  it('pins the actual outbound request to the validated address returned by lookup', async () => {
    const lookupMock = makeLookup([{ address: '93.184.216.34', family: 4 }]);
    const transportMock = jest.fn(async (_destination: { address: string }) =>
      makeResponse('ok', {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
        url: 'https://example.com/data',
      })
    );
    const handler = makeTransportHandler(transportMock, lookupMock);

    const result = await handler.execute({
      url: 'https://example.com/data',
    });

    expect(lookupMock).toHaveBeenCalledWith('example.com');
    expect(transportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/data',
        hostname: 'example.com',
        address: '93.184.216.34',
        family: 4,
      }),
      expect.objectContaining({
        method: 'GET',
      })
    );
    expect(result).toMatchObject({
      status: 200,
      body: 'ok',
    });
  });

  /* Preconditions: preflight lookup resolves a public address, but the transport would connect to a different internal address if left unchecked
     Action: execute helper through the bound transport path
     Assertions: the handler passes only the preflight-validated public address to the transport, closing lookup/connect mismatch
     Requirements: sandbox-http-request.2.3.1, sandbox-http-request.3.2.1, sandbox-http-request.4.2.2 */
  it('prevents lookup-connect mismatch by binding transport to the validated public address', async () => {
    const lookupMock = makeLookup([{ address: '93.184.216.34', family: 4 }]);
    const transportMock = jest.fn(async (destination: { address: string }) => {
      expect(destination.address).toBe('93.184.216.34');
      return makeResponse('ok', {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
        url: 'https://example.com/data',
      });
    });
    const handler = makeTransportHandler(transportMock, lookupMock);

    const result = await handler.execute({
      url: 'https://example.com/data',
    });

    expect(transportMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 200,
      body: 'ok',
    });
  });

  /* Preconditions: hostname lookup resolves multiple validated public addresses in resolver order and the first connection attempt fails before any response is established
     Action: execute helper through the bound transport path
     Assertions: handler retries the next validated address in resolver order and succeeds on the second address
     Requirements: sandbox-http-request.3.2.1, sandbox-http-request.3.2.2 */
  it('retries the next validated public address when the first bound transport attempt fails', async () => {
    const lookupMock = makeLookup([
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
      { address: '93.184.216.34', family: 4 },
    ]);
    const transportMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 2606:2800:220:1:248:1893:25c8:1946'))
      .mockResolvedValueOnce(
        makeResponse('ok', {
          status: 200,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
          url: 'https://example.com/data',
        })
      );
    const handler = makeTransportHandler(transportMock, lookupMock);

    const result = await handler.execute({
      url: 'https://example.com/data',
    });

    expect(transportMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        hostname: 'example.com',
        address: '2606:2800:220:1:248:1893:25c8:1946',
        family: 6,
      }),
      expect.any(Object)
    );
    expect(transportMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        hostname: 'example.com',
        address: '93.184.216.34',
        family: 4,
      }),
      expect.any(Object)
    );
    expect(result).toMatchObject({
      status: 200,
      body: 'ok',
    });
  });

  /* Preconditions: hostname lookup resolves multiple validated public addresses and every bound transport attempt fails before any response is established
     Action: execute helper through the bound transport path
     Assertions: handler exhausts the validated addresses in resolver order and returns fetch_failed from the final connection error
     Requirements: sandbox-http-request.3.2.1, sandbox-http-request.3.2.2, sandbox-http-request.4.2.2 */
  it('returns fetch_failed after all validated public addresses fail to connect', async () => {
    const lookupMock = makeLookup([
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
      { address: '93.184.216.34', family: 4 },
    ]);
    const transportMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 2606:2800:220:1:248:1893:25c8:1946'))
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED 93.184.216.34'));
    const handler = makeTransportHandler(transportMock, lookupMock);

    const result = await handler.execute({
      url: 'https://example.com/data',
    });

    expect(transportMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      error: {
        code: 'fetch_failed',
        message: 'connect ECONNREFUSED 93.184.216.34',
      },
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
    const handler = makeHandler(fetchMock as unknown as typeof fetch);

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
    const handler = makeHandler(fetchMock as unknown as typeof fetch);

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
    const handler = makeHandler(fetchMock as unknown as typeof fetch);

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
    const handler = makeHandler(fetchMock as unknown as typeof fetch);

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
    const handler = makeHandler(fetchMock as unknown as typeof fetch);

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

  /* Preconditions: redirect response points to a forbidden localhost destination
     Action: execute helper with follow_redirects enabled
     Assertions: helper rejects the redirect hop before issuing the next request
     Requirements: sandbox-http-request.3.3.8, sandbox-http-request.4.2.2 */
  it('rejects redirects into forbidden localhost targets', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(
      makeResponse('', {
        status: 302,
        headers: { location: 'http://localhost:4567/private' },
      })
    );
    const handler = makeHandler(fetchMock as unknown as typeof fetch);

    const result = await handler.execute({
      url: 'https://example.com/start',
      follow_redirects: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      error: {
        code: 'forbidden_destination',
      },
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
    const handler = makeHandler(fetchMock as unknown as typeof fetch);

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
    const handler = makeHandler(fetchMock);

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
    const handler = makeHandler(fetchMock);

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
    const handler = makeHandler(fetchMock);

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
    const handler = makeHandler(fetchMock);

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
    const handler = makeHandler(fetchMock);

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
