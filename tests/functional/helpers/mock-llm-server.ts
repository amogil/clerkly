// Requirements: settings.3, testing.3.9

import * as http from 'http';
import * as url from 'url';

export interface MockLLMServerConfig {
  port: number;
}

interface RequestLog {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: any;
  timestamp: number;
}

/**
 * Mock LLM Server
 *
 * Emulates LLM provider endpoints (OpenAI, Anthropic, Google) for testing purposes.
 * Allows functional tests to test LLM connection without real API keys.
 *
 * Requirements: settings.3 - Test LLM connection functionality
 * Requirements: testing.3.9 - Mock external services in functional tests
 */
export class MockLLMServer {
  private server: http.Server | null = null;
  private port: number;
  private shouldSucceed: boolean = true;
  private errorStatus: number = 401;
  private errorMessage: string = 'Invalid API key';
  private requestLogs: RequestLog[] = [];
  private responseDelay: number = 0; // Delay in milliseconds
  // Streaming chat response config
  private streamingEnabled: boolean = false;
  private streamingReasoning: string = '';
  private streamingContent: string =
    '{"action":{"type":"text","content":"Hello! How can I help?"}}';
  private streamingErrorStatus: number = 0; // 0 = no error
  private streamingChunkDelayMs: number = 0; // delay between chunks (for interrupt tests)

  constructor(config: MockLLMServerConfig) {
    this.port = config.port;
  }

  private logRequest(method: string, path: string, headers: any, body: any) {
    this.requestLogs.push({
      method,
      path,
      headers,
      body,
      timestamp: Date.now(),
    });
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const parsedUrl = url.parse(req.url || '', true);
    const pathname = parsedUrl.pathname || '';

    console.log(`[MOCK LLM] ${req.method} ${pathname}`);

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Only handle POST requests
    if (req.method !== 'POST') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    // Read request body
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      let parsedBody: any = {};
      try {
        parsedBody = JSON.parse(body);
      } catch (e) {
        // Ignore parse errors
      }

      this.logRequest(req.method || 'POST', pathname, req.headers, parsedBody);

      // Route to appropriate handler
      if (pathname === '/v1/chat/completions') {
        this.handleOpenAI(res);
      } else if (pathname === '/v1/messages') {
        this.handleAnthropic(res);
      } else if (pathname.startsWith('/v1beta/models/') && pathname.includes('generateContent')) {
        this.handleGoogle(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });
  }

  private handleOpenAI(res: http.ServerResponse): void {
    console.log('[MOCK LLM] OpenAI request received');

    const sendResponse = () => {
      if (this.streamingEnabled) {
        this.handleOpenAIStreaming(res);
        return;
      }

      if (this.shouldSucceed) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            choices: [{ message: { content: 'test' } }],
          })
        );
      } else {
        res.writeHead(this.errorStatus, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: { message: this.errorMessage },
          })
        );
      }
    };

    if (this.responseDelay > 0) {
      setTimeout(sendResponse, this.responseDelay);
    } else {
      sendResponse();
    }
  }

  /**
   * Handle OpenAI streaming chat request (SSE format)
   * Emits reasoning chunks then content chunks, matching OpenAIProvider.parseStream() expectations
   */
  private handleOpenAIStreaming(res: http.ServerResponse): void {
    if (this.streamingErrorStatus > 0) {
      res.writeHead(this.streamingErrorStatus, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: this.errorMessage } }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const sendChunk = (data: object) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const streamAll = async () => {
      // Stream reasoning chunks (if any)
      if (this.streamingReasoning) {
        const words = this.streamingReasoning.split(' ');
        for (const word of words) {
          sendChunk({
            choices: [{ delta: { reasoning: word + ' ' }, finish_reason: null }],
          });
          if (this.streamingChunkDelayMs > 0) {
            await delay(this.streamingChunkDelayMs);
          }
        }
      }

      // Stream content chunks (structured output JSON split into pieces)
      const contentChunks = this.streamingContent.match(/.{1,20}/g) || [this.streamingContent];
      for (const chunk of contentChunks) {
        sendChunk({
          choices: [{ delta: { content: chunk }, finish_reason: null }],
        });
        if (this.streamingChunkDelayMs > 0) {
          await delay(this.streamingChunkDelayMs);
        }
      }

      // Final chunk with usage
      sendChunk({
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          prompt_tokens_details: { cached_tokens: 0 },
          completion_tokens_details: { reasoning_tokens: 10 },
        },
      });

      res.write('data: [DONE]\n\n');
      res.end();
    };

    streamAll().catch(() => {
      // Client disconnected — ignore
      res.end();
    });
  }

  private handleAnthropic(res: http.ServerResponse): void {
    console.log('[MOCK LLM] Anthropic request received');

    const sendResponse = () => {
      if (this.shouldSucceed) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            content: [{ text: 'test' }],
          })
        );
      } else {
        res.writeHead(this.errorStatus, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: { message: this.errorMessage },
          })
        );
      }
    };

    if (this.responseDelay > 0) {
      setTimeout(sendResponse, this.responseDelay);
    } else {
      sendResponse();
    }
  }

  private handleGoogle(res: http.ServerResponse): void {
    console.log('[MOCK LLM] Google request received');

    const sendResponse = () => {
      if (this.shouldSucceed) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: 'test' }] } }],
          })
        );
      } else {
        res.writeHead(this.errorStatus, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: { message: this.errorMessage },
          })
        );
      }
    };

    if (this.responseDelay > 0) {
      setTimeout(sendResponse, this.responseDelay);
    } else {
      sendResponse();
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(this.port, () => {
        console.log(`[MOCK LLM] Server started on port ${this.port}`);
        resolve();
      });

      this.server.on('error', (error) => {
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('[MOCK LLM] Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  setSuccess(success: boolean) {
    this.shouldSucceed = success;
  }

  setError(status: number, message: string) {
    this.errorStatus = status;
    this.errorMessage = message;
  }

  setDelay(delayMs: number) {
    this.responseDelay = delayMs;
    console.log(`[MOCK LLM] Response delay set to: ${delayMs}ms`);
  }

  /** Enable streaming mode for chat requests */
  setStreamingMode(
    enabled: boolean,
    options?: {
      reasoning?: string;
      content?: string;
      errorStatus?: number;
      errorMessage?: string;
      chunkDelayMs?: number;
    }
  ) {
    this.streamingEnabled = enabled;
    if (options?.reasoning !== undefined) this.streamingReasoning = options.reasoning;
    if (options?.content !== undefined) this.streamingContent = options.content;
    if (options?.errorStatus !== undefined) this.streamingErrorStatus = options.errorStatus;
    if (options?.errorMessage !== undefined) this.errorMessage = options.errorMessage;
    if (options?.chunkDelayMs !== undefined) this.streamingChunkDelayMs = options.chunkDelayMs;
  }

  getBaseUrl(): string {
    return `http://localhost:${this.port}`;
  }

  getRequestLogs(): RequestLog[] {
    return this.requestLogs;
  }

  getLastRequest(): RequestLog | undefined {
    return this.requestLogs[this.requestLogs.length - 1];
  }

  clearRequestLogs() {
    this.requestLogs = [];
  }
}
