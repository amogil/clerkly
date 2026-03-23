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

interface MockOpenAIToolCall {
  callId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

interface MockOpenAIStreamScript {
  reasoning?: string;
  content?: string;
  toolCalls?: MockOpenAIToolCall[];
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
  private streamingContent: string = 'Hello! How can I help?';
  private streamingErrorStatus: number = 0; // 0 = no error
  private streamingChunkDelayMs: number = 0; // delay between chunks (for interrupt tests)
  private openAIStreamScripts: MockOpenAIStreamScript[] = [];
  private rateLimitEnabled: boolean = false;
  private rateLimitRetryAfterSeconds: number = 10;
  private webSearchErrorStatus: number = 0; // 0 = disabled, >0 = return this status for web_search requests

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
      if (pathname === '/v1/responses') {
        this.handleOpenAI(res, parsedBody);
      } else if (pathname === '/v1/messages') {
        this.handleAnthropic(res, parsedBody);
      } else if (pathname.startsWith('/v1beta/models/') && pathname.includes('generateContent')) {
        this.handleGoogle(res, parsedBody);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });
  }

  private handleOpenAI(res: http.ServerResponse, body?: any): void {
    console.log('[MOCK LLM] OpenAI request received');

    const hasWebSearchTool =
      Array.isArray(body?.tools) &&
      body.tools.some(
        (tool: unknown) =>
          tool &&
          typeof tool === 'object' &&
          (tool as { type?: unknown }).type === 'web_search_preview'
      );

    const sendResponse = () => {
      if (hasWebSearchTool) {
        if (this.webSearchErrorStatus > 0) {
          res.writeHead(this.webSearchErrorStatus, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: { message: this.errorMessage },
            })
          );
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: `resp_${Date.now()}`,
            output: [
              {
                type: 'web_search_call',
                status: 'completed',
              },
              {
                type: 'message',
                content: [{ type: 'output_text', text: 'Mock web search payload' }],
              },
            ],
          })
        );
        return;
      }

      // Rate limit mode takes priority
      if (this.rateLimitEnabled) {
        res.writeHead(429, {
          'Content-Type': 'application/json',
          'retry-after': String(this.rateLimitRetryAfterSeconds),
        });
        res.end(
          JSON.stringify({
            error: {
              message: `Rate limit exceeded. Please try again in ${this.rateLimitRetryAfterSeconds}.000s`,
            },
          })
        );
        return;
      }

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
    // Snapshot streaming configuration per-request to avoid cross-request races
    // when tests reconfigure the mock while an older stream is still in-flight.
    const streamingErrorStatus = this.streamingErrorStatus;
    const streamingReasoning = this.streamingReasoning;
    const streamingContent = this.normalizeStreamingContent(this.streamingContent);
    const streamingChunkDelayMs = this.streamingChunkDelayMs;
    const scriptedResponse =
      this.openAIStreamScripts.length > 0 ? this.openAIStreamScripts.shift() : null;

    if (streamingErrorStatus > 0) {
      res.writeHead(streamingErrorStatus, { 'Content-Type': 'application/json' });
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
      const messageItemId = `msg_${Date.now()}`;
      const reasoningItemId = `rs_${Date.now()}`;

      sendChunk({
        type: 'response.created',
        response: {
          id: `resp_${Date.now()}`,
          created_at: Math.floor(Date.now() / 1000),
          model: 'gpt-5-nano',
          service_tier: null,
        },
      });

      if (scriptedResponse) {
        sendChunk({
          type: 'response.output_item.added',
          output_index: 0,
          item: { type: 'message', id: messageItemId, phase: 'commentary' },
        });

        if (scriptedResponse.reasoning) {
          sendChunk({
            type: 'response.output_item.added',
            output_index: 1,
            item: { type: 'reasoning', id: reasoningItemId, encrypted_content: null },
          });
          sendChunk({
            type: 'response.reasoning_summary_part.added',
            item_id: reasoningItemId,
            summary_index: 0,
          });
          for (const word of scriptedResponse.reasoning.split(' ')) {
            sendChunk({
              type: 'response.reasoning_summary_text.delta',
              item_id: reasoningItemId,
              summary_index: 0,
              delta: `${word} `,
            });
            if (streamingChunkDelayMs > 0) {
              await delay(streamingChunkDelayMs);
            }
          }
          sendChunk({
            type: 'response.reasoning_summary_part.done',
            item_id: reasoningItemId,
            summary_index: 0,
          });
          sendChunk({
            type: 'response.output_item.done',
            output_index: 1,
            item: { type: 'reasoning', id: reasoningItemId, encrypted_content: null },
          });
        }

        for (const [index, toolCall] of (scriptedResponse.toolCalls ?? []).entries()) {
          const toolOutputIndex = index + 2;
          sendChunk({
            type: 'response.output_item.added',
            output_index: toolOutputIndex,
            item: {
              type: 'function_call',
              id: `fc_${toolCall.callId}`,
              call_id: toolCall.callId,
              name: toolCall.toolName,
              arguments: '',
            },
          });
          sendChunk({
            type: 'response.function_call_arguments.delta',
            item_id: `fc_${toolCall.callId}`,
            output_index: toolOutputIndex,
            delta: JSON.stringify(toolCall.arguments),
          });
          sendChunk({
            type: 'response.output_item.done',
            output_index: toolOutputIndex,
            item: {
              type: 'function_call',
              id: `fc_${toolCall.callId}`,
              call_id: toolCall.callId,
              name: toolCall.toolName,
              arguments: JSON.stringify(toolCall.arguments),
              status: 'completed',
            },
          });
          if (streamingChunkDelayMs > 0) {
            await delay(streamingChunkDelayMs);
          }
        }

        const scriptedContent = this.normalizeStreamingContent(scriptedResponse.content ?? '');
        if (scriptedContent) {
          const chunks = scriptedContent.match(/[\s\S]{1,20}/g) || [scriptedContent];
          for (const chunk of chunks) {
            sendChunk({ type: 'response.output_text.delta', item_id: messageItemId, delta: chunk });
            if (streamingChunkDelayMs > 0) {
              await delay(streamingChunkDelayMs);
            }
          }
        }

        sendChunk({
          type: 'response.output_item.done',
          output_index: 0,
          item: { type: 'message', id: messageItemId, phase: 'final_answer' },
        });

        sendChunk({
          type: 'response.completed',
          response: {
            usage: {
              input_tokens: 100,
              output_tokens: 50,
              total_tokens: 150,
              input_tokens_details: { cached_tokens: 0 },
              output_tokens_details: { reasoning_tokens: 10 },
            },
          },
        });

        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      sendChunk({
        type: 'response.output_item.added',
        output_index: 0,
        item: { type: 'message', id: messageItemId, phase: 'commentary' },
      });

      // Stream reasoning chunks (if any)
      if (streamingReasoning) {
        sendChunk({
          type: 'response.output_item.added',
          output_index: 1,
          item: { type: 'reasoning', id: reasoningItemId, encrypted_content: null },
        });
        sendChunk({
          type: 'response.reasoning_summary_part.added',
          item_id: reasoningItemId,
          summary_index: 0,
        });
        const words = streamingReasoning.split(' ');
        for (const word of words) {
          sendChunk({
            type: 'response.reasoning_summary_text.delta',
            item_id: reasoningItemId,
            summary_index: 0,
            delta: word + ' ',
          });
          if (streamingChunkDelayMs > 0) {
            await delay(streamingChunkDelayMs);
          }
        }
        sendChunk({
          type: 'response.reasoning_summary_part.done',
          item_id: reasoningItemId,
          summary_index: 0,
        });
        sendChunk({
          type: 'response.output_item.done',
          output_index: 1,
          item: { type: 'reasoning', id: reasoningItemId, encrypted_content: null },
        });
      }

      // Stream content chunks; include newlines so multiline markdown is preserved.
      const contentChunks = streamingContent.match(/[\s\S]{1,20}/g) || [streamingContent];
      for (const chunk of contentChunks) {
        sendChunk({ type: 'response.output_text.delta', item_id: messageItemId, delta: chunk });
        if (streamingChunkDelayMs > 0) {
          await delay(streamingChunkDelayMs);
        }
      }

      sendChunk({
        type: 'response.output_item.done',
        output_index: 0,
        item: { type: 'message', id: messageItemId, phase: 'final_answer' },
      });

      // Final chunk with usage
      sendChunk({
        type: 'response.completed',
        response: {
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 10 },
          },
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

  private normalizeStreamingContent(content: string): string {
    if (!content) return content;
    try {
      const parsed = JSON.parse(content) as { action?: { content?: unknown } };
      const actionText = parsed?.action?.content;
      return typeof actionText === 'string' ? actionText : content;
    } catch {
      return content;
    }
  }

  private handleAnthropic(res: http.ServerResponse, body?: any): void {
    console.log('[MOCK LLM] Anthropic request received');
    const hasWebSearchTool =
      Array.isArray(body?.tools) &&
      body.tools.some(
        (tool: unknown) =>
          tool &&
          typeof tool === 'object' &&
          (tool as { type?: unknown }).type === 'web_search_20250305'
      );

    const sendResponse = () => {
      if (hasWebSearchTool) {
        if (this.webSearchErrorStatus > 0) {
          res.writeHead(this.webSearchErrorStatus, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: { message: this.errorMessage },
            })
          );
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: `msg_${Date.now()}`,
            content: [
              {
                type: 'web_search_tool_result',
                content: [
                  {
                    type: 'web_search_result',
                    title: 'Mock Anthropic Search Result',
                    url: 'https://news.example.com/anthropic',
                  },
                ],
              },
            ],
          })
        );
        return;
      }

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

  private handleGoogle(res: http.ServerResponse, body?: any): void {
    console.log('[MOCK LLM] Google request received');
    const hasGoogleSearchTool =
      Array.isArray(body?.tools) &&
      body.tools.some(
        (tool: unknown) =>
          tool &&
          typeof tool === 'object' &&
          typeof (tool as { googleSearch?: unknown }).googleSearch === 'object'
      );

    const sendResponse = () => {
      if (hasGoogleSearchTool) {
        if (this.webSearchErrorStatus > 0) {
          res.writeHead(this.webSearchErrorStatus, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: { message: this.errorMessage },
            })
          );
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: 'Mock Google Search Result' }],
                },
                groundingMetadata: {
                  groundingChunks: [
                    {
                      web: {
                        uri: 'https://news.example.com/google',
                        title: 'Mock Google Search Result',
                      },
                    },
                  ],
                },
              },
            ],
          })
        );
        return;
      }

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
    if (enabled) this.rateLimitEnabled = false; // streaming mode disables rate limit
    if (options?.reasoning !== undefined) this.streamingReasoning = options.reasoning;
    if (options?.content !== undefined) this.streamingContent = options.content;
    if (options?.errorStatus !== undefined) this.streamingErrorStatus = options.errorStatus;
    if (options?.errorMessage !== undefined) this.errorMessage = options.errorMessage;
    if (options?.chunkDelayMs !== undefined) this.streamingChunkDelayMs = options.chunkDelayMs;
  }

  setOpenAIStreamScripts(scripts: MockOpenAIStreamScript[]) {
    this.openAIStreamScripts = [...scripts];
  }

  /** Enable rate limit mode -- server returns 429 with retry-after header */
  setRateLimitMode(enabled: boolean, retryAfterSeconds: number = 10) {
    this.rateLimitEnabled = enabled;
    this.rateLimitRetryAfterSeconds = retryAfterSeconds;
    if (enabled) {
      this.streamingEnabled = false;
    }
    console.log(`[MOCK LLM] Rate limit mode: ${enabled}, retry-after: ${retryAfterSeconds}s`);
  }

  /** Make web_search adapter requests return HTTP error instead of success */
  setWebSearchErrorMode(errorStatus: number) {
    this.webSearchErrorStatus = errorStatus;
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
