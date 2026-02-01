// Requirements: testing-infrastructure.2.2

/**
 * HTTP method types for network requests
 * Requirements: testing-infrastructure.2.2
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";

/**
 * Request options for network operations
 * Requirements: testing-infrastructure.2.2
 */
export interface RequestOptions {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
}

/**
 * Mock response interface for network operations
 * Requirements: testing-infrastructure.2.2
 */
export interface MockResponse {
  status: number;
  data: any;
  headers: Record<string, string>;
}

/**
 * Request handler type for network interception
 * Requirements: testing-infrastructure.2.2
 */
export type RequestHandler = (
  url: string,
  options?: RequestOptions,
) => MockResponse | Promise<MockResponse>;

/**
 * Network request interceptor configuration
 * Requirements: testing-infrastructure.2.2
 */
export interface NetworkInterceptor {
  pattern: string | RegExp;
  handler: RequestHandler;
  method?: HttpMethod;
  once?: boolean;
}

/**
 * Network request details for handlers
 * Requirements: testing-infrastructure.2.2
 */
export interface NetworkRequest {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body?: any;
}

/**
 * Interface for network mock operations
 * Requirements: testing-infrastructure.2.2
 */
export interface NetworkMock {
  get(url: string): Promise<MockResponse>;
  post(url: string, data: any): Promise<MockResponse>;
  put(url: string, data: any): Promise<MockResponse>;
  delete(url: string): Promise<MockResponse>;
  patch(url: string, data: any): Promise<MockResponse>;
  intercept(pattern: string, handler: RequestHandler): void;
  interceptMethod(method: HttpMethod, pattern: string, handler: RequestHandler): void;
  interceptOnce(pattern: string, handler: RequestHandler): void;
  setDefaultResponse(response: MockResponse): void;
  getRequestHistory(): NetworkRequest[];
  getRequestsMatching(pattern: string | RegExp): NetworkRequest[];
  clearHistory(): void;
  simulateNetworkError(pattern: string, error: Error): void;
  simulateTimeout(pattern: string, timeout?: number): void;
  reset(): void;
}

/**
 * Enhanced implementation for NetworkMock with comprehensive HTTP request interception
 * Requirements: testing-infrastructure.2.2
 */
export class NetworkMockImpl implements NetworkMock {
  private interceptors: NetworkInterceptor[] = [];
  private requestHistory: NetworkRequest[] = [];
  private defaultResponse: MockResponse = { status: 200, data: {}, headers: {} };
  private globalFetchMock: any = null;

  constructor() {
    this.setupGlobalFetchMock();
  }

  /**
   * Perform GET request with mock interception
   * Requirements: testing-infrastructure.2.2
   */
  async get(url: string): Promise<MockResponse> {
    return this.makeRequest(url, { method: "GET" });
  }

  /**
   * Perform POST request with mock interception
   * Requirements: testing-infrastructure.2.2
   */
  async post(url: string, data: any): Promise<MockResponse> {
    return this.makeRequest(url, { method: "POST", body: data });
  }

  /**
   * Perform PUT request with mock interception
   * Requirements: testing-infrastructure.2.2
   */
  async put(url: string, data: any): Promise<MockResponse> {
    return this.makeRequest(url, { method: "PUT", body: data });
  }

  /**
   * Perform DELETE request with mock interception
   * Requirements: testing-infrastructure.2.2
   */
  async delete(url: string): Promise<MockResponse> {
    return this.makeRequest(url, { method: "DELETE" });
  }

  /**
   * Perform PATCH request with mock interception
   * Requirements: testing-infrastructure.2.2
   */
  async patch(url: string, data: any): Promise<MockResponse> {
    return this.makeRequest(url, { method: "PATCH", body: data });
  }

  /**
   * Register request interceptor with pattern matching
   * Requirements: testing-infrastructure.2.2
   */
  intercept(pattern: string, handler: RequestHandler): void {
    this.interceptors.push({ pattern, handler });
  }

  /**
   * Register method-specific request interceptor
   * Requirements: testing-infrastructure.2.2
   */
  interceptMethod(method: HttpMethod, pattern: string, handler: RequestHandler): void {
    this.interceptors.push({ pattern, handler, method });
  }

  /**
   * Register one-time request interceptor
   * Requirements: testing-infrastructure.2.2
   */
  interceptOnce(pattern: string, handler: RequestHandler): void {
    this.interceptors.push({ pattern, handler, once: true });
  }

  /**
   * Set default response for unmatched requests
   * Requirements: testing-infrastructure.2.2
   */
  setDefaultResponse(response: MockResponse): void {
    this.defaultResponse = response;
  }

  /**
   * Get history of all intercepted requests
   * Requirements: testing-infrastructure.2.2
   */
  getRequestHistory(): NetworkRequest[] {
    return [...this.requestHistory];
  }

  /**
   * Get requests matching a specific pattern
   * Requirements: testing-infrastructure.2.2
   */
  getRequestsMatching(pattern: string | RegExp): NetworkRequest[] {
    return this.requestHistory.filter((request) => this.matchesPattern(request.url, pattern));
  }

  /**
   * Clear request history
   * Requirements: testing-infrastructure.2.2
   */
  clearHistory(): void {
    this.requestHistory = [];
  }

  /**
   * Simulate network error for specific pattern
   * Requirements: testing-infrastructure.2.2
   */
  simulateNetworkError(pattern: string, error: Error): void {
    this.intercept(pattern, () => {
      throw error;
    });
  }

  /**
   * Simulate timeout for specific pattern
   * Requirements: testing-infrastructure.2.2
   */
  simulateTimeout(pattern: string, timeout: number = 5000): void {
    this.intercept(pattern, () => {
      return new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Request timeout after ${timeout}ms`));
        }, timeout);
      });
    });
  }

  /**
   * Reset all interceptors and history
   * Requirements: testing-infrastructure.2.2
   */
  reset(): void {
    this.interceptors = [];
    this.requestHistory = [];
    this.defaultResponse = { status: 200, data: {}, headers: {} };
    this.restoreGlobalFetch();
    this.setupGlobalFetchMock();
  }

  /**
   * Setup global fetch mock to intercept all network requests
   * Requirements: testing-infrastructure.2.2
   */
  private setupGlobalFetchMock(): void {
    if (typeof global !== "undefined" && global.fetch) {
      this.globalFetchMock = global.fetch;
      global.fetch = this.mockFetch.bind(this);
    }
  }

  /**
   * Restore original global fetch
   * Requirements: testing-infrastructure.2.2
   */
  private restoreGlobalFetch(): void {
    if (this.globalFetchMock && typeof global !== "undefined") {
      global.fetch = this.globalFetchMock;
      this.globalFetchMock = null;
    }
  }

  /**
   * Mock fetch implementation that intercepts all network requests
   * Requirements: testing-infrastructure.2.2
   */
  private async mockFetch(input: string | Request, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input.url;
    const method = (init?.method || "GET").toUpperCase() as HttpMethod;
    const headers = this.parseHeaders(init?.headers);
    const body = init?.body;

    const request: NetworkRequest = { url, method, headers, body };
    this.requestHistory.push(request);

    const handler = this.findHandler(url, method);
    if (handler) {
      const mockResponse = await handler(url, { method, headers, body });
      return this.createFetchResponse(mockResponse);
    }

    // Return default response if no handler found
    return this.createFetchResponse(this.defaultResponse);
  }

  /**
   * Create a Response object from MockResponse
   * Requirements: testing-infrastructure.2.2
   */
  private createFetchResponse(mockResponse: MockResponse): Response {
    const responseInit: ResponseInit = {
      status: mockResponse.status,
      headers: mockResponse.headers,
    };

    const body =
      typeof mockResponse.data === "string" ? mockResponse.data : JSON.stringify(mockResponse.data);

    return new Response(body, responseInit);
  }

  /**
   * Parse headers from various formats
   * Requirements: testing-infrastructure.2.2
   */
  private parseHeaders(headers?: HeadersInit): Record<string, string> {
    if (!headers) return {};

    if (headers instanceof Headers) {
      const result: Record<string, string> = {};
      headers.forEach((value, key) => {
        result[key] = value;
      });
      return result;
    }

    if (Array.isArray(headers)) {
      const result: Record<string, string> = {};
      headers.forEach(([key, value]) => {
        result[key] = value;
      });
      return result;
    }

    return headers as Record<string, string>;
  }

  /**
   * Make a network request with mock interception
   * Requirements: testing-infrastructure.2.2
   */
  private async makeRequest(url: string, options: RequestOptions): Promise<MockResponse> {
    const method = options.method || "GET";
    const headers = options.headers || {};
    const body = options.body;

    const request: NetworkRequest = { url, method, headers, body };
    this.requestHistory.push(request);

    const handler = this.findHandler(url, method);
    if (handler) {
      return await handler(url, options);
    }

    return this.defaultResponse;
  }

  /**
   * Find matching handler for URL and method
   * Requirements: testing-infrastructure.2.2
   */
  private findHandler(url: string, method?: HttpMethod): RequestHandler | undefined {
    for (let i = 0; i < this.interceptors.length; i++) {
      const interceptor = this.interceptors[i];

      // Check method match if specified
      if (interceptor.method && method && interceptor.method !== method) {
        continue;
      }

      // Check pattern match
      if (this.matchesPattern(url, interceptor.pattern)) {
        const handler = interceptor.handler;

        // Remove one-time interceptors after use
        if (interceptor.once) {
          this.interceptors.splice(i, 1);
        }

        return handler;
      }
    }

    return undefined;
  }

  /**
   * Check if URL matches pattern (string or regex)
   * Requirements: testing-infrastructure.2.2
   */
  private matchesPattern(url: string, pattern: string | RegExp): boolean {
    if (typeof pattern === "string") {
      return url.includes(pattern);
    } else {
      return pattern.test(url);
    }
  }
}

/**
 * Global network mock instance
 * Requirements: testing-infrastructure.2.2
 */
export const networkMock = new NetworkMockImpl();
