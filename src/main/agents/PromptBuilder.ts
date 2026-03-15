// Requirements: llm-integration.4
// src/main/agents/PromptBuilder.ts
// Builds LLM prompts from agent history and features

import type { Message } from '../db/schema';
import type { LLMTool, ChatMessage } from '../llm/ILLMProvider';
import {
  CODE_EXEC_LIMITS,
  CODE_EXEC_TOOL_SCHEMA,
  validateCodeExecInput,
} from '../code_exec/contracts';
import { SandboxSessionManager } from '../code_exec/SandboxSessionManager';
import { DEFAULT_AGENT_TITLE } from '../../shared/constants/agents';

/**
 * Normalize prompt text for stable model input:
 * - collapses repeated horizontal spaces/tabs
 * - strips trailing spaces on lines
 * - collapses 3+ newlines to a single blank line
 * - trims leading/trailing blank area
 *
 * Requirements: llm-integration.4.5
 */
export function normalizePromptWhitespace(prompt: string): string {
  const normalizedByLine = prompt
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/g, ''))
    .join('\n');

  return normalizedByLine.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Build dynamic system instruction for auto-title metadata generation.
 * Requirements: llm-integration.16.1, llm-integration.16.2, llm-integration.16.10
 */
export function buildAutoTitleMetadataContractPrompt(currentTitle: string): string {
  return [
    'Auto-title metadata contract:',
    '- You MUST emit exactly one HTML comment in this exact format: <!-- clerkly:title-meta: {"title":"<short title>","rename_need_score":NN} -->',
    `- Current chat title: "${currentTitle}".`,
    `- If current title is "${DEFAULT_AGENT_TITLE}", emit only for the first meaningful user request.`,
    '- Emit the comment only if the title should change now.',
    '- Do not emit the comment for trivial/empty/low-signal requests.',
    '- Keep <short title> concise plain text: target 3-12 words, max 200 characters.',
    '- NN must be an integer 0..100; higher means stronger need to rename current title.',
    '- The comment must not alter the user-facing answer semantics.',
  ].join('\n');
}

const HTTP_REQUEST_PROMPT_SPEC = {
  title: 'Sandbox HTTP helper:',
  invocation: '`const result = await tools.http_request({ ... })`',
  inputFields: [
    '`url`: required absolute `http` or `https` URL string.',
    '`method`: optional HTTP method string; default `GET`; allowed: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`.',
    '`headers`: optional flat JSON object with string keys and string values, for example `{ "accept": "application/json", "x-trace-id": "abc-123" }`.',
    '`body`: optional string request body; do not send `body` with `GET` or `HEAD`.',
    '`timeout_ms`: optional integer in milliseconds; default `10000`; maximum `180000`.',
    '`follow_redirects`: optional boolean; default `true`.',
    '`max_response_bytes`: optional integer byte limit for the returned response body.',
  ],
  responseFields: [
    '`status`: final HTTP status code.',
    '`final_url`: final response URL after redirects.',
    '`headers`: response headers as a flat object.',
    '`content_type`: response content type string; empty string when the header is absent.',
    '`body_encoding`: `text` for textual responses, `base64` for non-text responses.',
    '`body`: response body string encoded according to `body_encoding`.',
    '`truncated`: `true` if `max_response_bytes` cut the response body.',
    '`applied_limit_bytes`: actual byte limit applied to the response body.',
  ],
  requestExample: [
    '```js',
    'const result = await tools.http_request({',
    '  url: "https://example.com/api/items?limit=5",',
    '  method: "GET",',
    '  headers: { "accept": "application/json" },',
    '  timeout_ms: 10000,',
    '});',
    '```',
  ],
  responseExample: [
    '```js',
    '{',
    '  status: 200,',
    '  final_url: "https://example.com/api/items?limit=5",',
    '  headers: { "content-type": "application/json; charset=utf-8" },',
    '  content_type: "application/json; charset=utf-8",',
    '  body_encoding: "text",',
    '  body: "{\\"items\\":[...]}",',
    '  truncated: false',
    '}',
    '```',
  ],
} as const;

function buildHttpRequestPromptSection(): string {
  return [
    HTTP_REQUEST_PROMPT_SPEC.title,
    `- Call form: ${HTTP_REQUEST_PROMPT_SPEC.invocation}.`,
    '- Input fields:',
    ...HTTP_REQUEST_PROMPT_SPEC.inputFields.map((field) => `  - ${field}`),
    '- Response fields:',
    ...HTTP_REQUEST_PROMPT_SPEC.responseFields.map((field) => `  - ${field}`),
    '- Request example:',
    ...HTTP_REQUEST_PROMPT_SPEC.requestExample,
    '- Response example:',
    ...HTTP_REQUEST_PROMPT_SPEC.responseExample,
  ].join('\n');
}

/**
 * A feature that contributes a system prompt section and/or tools
 * Requirements: llm-integration.4.1
 */
export interface AgentFeature {
  name: string;
  getSystemPromptSection(): string;
  getTools(): LLMTool[];
}

/**
 * Strategy for selecting which messages to include in history
 * Requirements: llm-integration.4.2
 */
export interface HistoryStrategy {
  select(messages: Message[]): Message[];
}

/**
 * Result of building a prompt
 * Requirements: llm-integration.4.3
 */
export interface BuiltPrompt {
  /** Combined system prompt (base + all feature sections) */
  systemPrompt: string;
  /** All tools from all features */
  tools: LLMTool[];
}

/**
 * Returns all messages as-is (MVP strategy)
 * Requirements: llm-integration.4.2
 */
export class FullHistoryStrategy implements HistoryStrategy {
  select(messages: Message[]): Message[] {
    return messages;
  }
}

/**
 * Builds LLM prompts from agent history and features.
 *
 * - Combines base system prompt with feature sections
 * - Builds replayable history as chat messages
 * - Collects tools from all features
 * - Excludes service fields (model and reasoning*) from replayed payloads
 *
 * Requirements: llm-integration.4
 */
export class PromptBuilder {
  constructor(
    private systemPrompt: string,
    private features: AgentFeature[],
    private historyStrategy: HistoryStrategy
  ) {}

  /**
   * Build provider-agnostic prompt metadata
   * Requirements: llm-integration.4.3
   */
  build(): BuiltPrompt {
    return {
      systemPrompt: this.buildSystemPrompt(),
      tools: this.collectTools(),
    };
  }

  /**
   * Build provider-ready ChatMessage[] for the LLM API
   * Requirements: llm-integration.10
   */
  buildMessages(messages: Message[]): ChatMessage[] {
    return [
      { role: 'system', content: this.buildSystemPrompt() },
      ...this.buildHistoryMessages(messages),
    ];
  }

  private buildSystemPrompt(): string {
    const parts = [this.systemPrompt];
    for (const feature of this.features) {
      const section = feature.getSystemPromptSection();
      if (section) parts.push(section);
    }
    return normalizePromptWhitespace(parts.join('\n\n'));
  }

  private collectTools(): LLMTool[] {
    return this.features.flatMap((f) => f.getTools());
  }

  private buildHistoryMessages(messages: Message[]): ChatMessage[] {
    const selected = this.historyStrategy.select(messages);
    const history: ChatMessage[] = [];

    for (const msg of selected) {
      if (msg.hidden || (msg.kind !== 'user' && msg.kind !== 'llm' && msg.kind !== 'tool_call')) {
        continue;
      }
      const payload = this.parsePayload(msg.payloadJson);
      if (msg.kind === 'tool_call') {
        const toolReplay = this.toolReplayForHistory(payload);
        if (toolReplay.length > 0) {
          history.push(...toolReplay);
        }
      } else {
        const content = this.messageContentForReplay(msg.kind, payload);
        if (!content) {
          continue;
        }
        history.push({
          role: msg.kind === 'user' ? 'user' : 'assistant',
          content,
        });
      }
    }

    return history;
  }

  private parsePayload(payloadJson: string): Record<string, unknown> {
    try {
      return JSON.parse(payloadJson) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private messageContentForReplay(kind: Message['kind'], payload: Record<string, unknown>): string {
    const sanitized = this.sortKeys(this.sanitizePayload(payload)) as Record<string, unknown>;
    const data =
      sanitized['data'] && typeof sanitized['data'] === 'object'
        ? (sanitized['data'] as Record<string, unknown>)
        : undefined;

    if (kind === 'user') {
      const text = data?.['text'];
      return typeof text === 'string' ? text.trim() : '';
    }

    const text = data?.['text'];
    if (typeof text === 'string' && text.trim().length > 0) {
      return text.trim();
    }

    return '';
  }

  private isTerminalToolStatus(status: unknown): boolean {
    return (
      status === 'success' || status === 'error' || status === 'timeout' || status === 'cancelled'
    );
  }

  /**
   * Serialize persisted terminal tool_call into AI SDK-compatible replay pair:
   * assistant(tool-call) + tool(tool-result).
   * Requirements: llm-integration.11.3.1.1, llm-integration.11.3.1.3
   */
  private toolReplayForHistory(payload: Record<string, unknown>): ChatMessage[] {
    const data =
      payload['data'] && typeof payload['data'] === 'object'
        ? (payload['data'] as Record<string, unknown>)
        : undefined;

    const toolName = typeof data?.['toolName'] === 'string' ? data['toolName'] : undefined;
    const toolCallId = typeof data?.['callId'] === 'string' ? data['callId'] : undefined;
    if (!toolName || !toolCallId) {
      return [];
    }

    const output = data?.['output'];
    const outputStatus =
      output && typeof output === 'object'
        ? (output as Record<string, unknown>)['status']
        : undefined;

    if (toolName !== 'final_answer' && !this.isTerminalToolStatus(outputStatus)) {
      return [];
    }

    const args = data?.['arguments'];
    const input =
      args && typeof args === 'object' && !Array.isArray(args)
        ? (args as Record<string, unknown>)
        : {};

    return [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId,
            toolName,
            input,
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId,
            toolName,
            output: {
              type: 'json',
              value: {
                status: this.isTerminalToolStatus(outputStatus) ? outputStatus : 'success',
                output: output ?? null,
              },
            },
          },
        ],
      },
    ];
  }

  /**
   * Remove fields excluded from replay (model and reasoning*)
   * Requirements: llm-integration.10.2
   */
  private sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = { ...payload };
    if ('kind' in result) {
      delete result['kind'];
    }
    if ('reply_to_message_id' in result) {
      delete result['reply_to_message_id'];
    }

    const data = result['data'] as Record<string, unknown> | undefined;
    if (data && typeof data === 'object') {
      const sanitizedData = { ...data };
      if ('model' in sanitizedData) {
        delete sanitizedData['model'];
      }
      for (const key of Object.keys(sanitizedData)) {
        if (key.startsWith('reasoning')) {
          delete sanitizedData[key];
        }
      }
      result['data'] = sanitizedData;
    }

    return result;
  }

  private sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.sortKeys(item));
    }
    if (!value || typeof value !== 'object') {
      return value;
    }
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = this.sortKeys(record[key]);
    }
    return sorted;
  }
}

/**
 * Built-in feature that defines terminal tool call used to mark task completion.
 * Requirements: llm-integration.9.2, llm-integration.11.2.1
 */
export class FinalAnswerFeature implements AgentFeature {
  name = 'final_answer';

  getSystemPromptSection(): string {
    return [
      'Final Answer tool usage:',
      '- Use normal assistant text for ongoing dialog: clarifying questions, intermediate updates, or requests for user input.',
      '- Call the `final_answer` tool only when you are confident the requested work is completed.',
      '- If the requested work is not complete and you are not calling `final_answer`, explicitly ask the user what information or confirmation you need next.',
      '- Call `final_answer` alone: do not combine it with any other tool call in the same turn.',
      '- Do not duplicate tool payload as plain assistant text: never output raw JSON that mirrors `final_answer` arguments/output.',
      '- Use `final_answer.summary_points` to list solved tasks (required: 1 to 10 non-empty points, each max 200 characters).',
      '- You MAY use Markdown (GFM) inside `final_answer.summary_points` when it improves clarity.',
      '- In `final_answer.summary_points`, mathematical expressions are optional; if used, format them with Markdown math delimiters: inline `$...$`, block `$$...$$`.',
    ].join('\n');
  }

  getTools(): LLMTool[] {
    return [
      {
        name: 'final_answer',
        description:
          'Marks task completion. Use only after task is fully done; summary_points must list solved tasks.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['summary_points'],
          properties: {
            summary_points: {
              type: 'array',
              description:
                'Required concise list of solved tasks (1-10 points, max 200 chars each).',
              minItems: 1,
              maxItems: 10,
              items: {
                type: 'string',
                minLength: 1,
                maxLength: 200,
                pattern: '.*\\S.*',
              },
            },
          },
        },
        // Keep execution deterministic and side-effect free.
        execute: async (args: Record<string, unknown>) => args,
      },
    ];
  }
}

/**
 * Built-in feature that defines sandboxed JavaScript execution tool.
 * Requirements: code_exec.1, code_exec.3, code_exec.5
 */
export class CodeExecFeature implements AgentFeature {
  name = 'code_exec';

  constructor(private readonly sandboxSessionManager: SandboxSessionManager) {}

  getSystemPromptSection(): string {
    return [
      'Code Exec tool usage:',
      '- Tool name: `code_exec`.',
      `- Input schema: JSON object with required string fields \`task_summary\` (1..200 non-whitespace-trimmed chars) and \`code\`, plus optional integer \`timeout_ms\` (${CODE_EXEC_LIMITS.timeoutMsMin}..${CODE_EXEC_LIMITS.timeoutMsPolicyCap}, default ${CODE_EXEC_LIMITS.timeoutMsDefault}).`,
      '- Output fields: `status`, `stdout`, `stderr`, `stdout_truncated`, `stderr_truncated`, optional `error`.',
      '- Status values: running | success | error | timeout | cancelled.',
      '- Execution context: your code runs inside an async function, so top-level `await` is supported.',
      '- Error codes in normal chat-flow outputs: policy_denied | sandbox_runtime_error | limit_exceeded | internal_error.',
      '- `invalid_tool_arguments` is defensive/runtime-local only (direct runtime calls) and is not persisted as chat `tool_call(code_exec)` output.',
      `- Limits: code <= ${CODE_EXEC_LIMITS.maxCodeBytes} bytes (30 KiB), stdout <= ${CODE_EXEC_LIMITS.maxStdoutBytes} bytes (10 KiB), stderr <= ${CODE_EXEC_LIMITS.maxStderrBytes} bytes (10 KiB), CPU limit ${CODE_EXEC_LIMITS.sandboxCpuLimit} vCPU, RAM limit 2 GiB.`,
      '- Allowed runtime API: console.log/info/warn/error and tools/window.tools (sandbox allowlist only).',
      buildHttpRequestPromptSection(),
      '- Browser-level network APIs are denied: fetch, XMLHttpRequest, WebSocket, sendBeacon, window.open, location.assign, location.replace.',
      '- Multithreading APIs are denied: Worker, SharedWorker, ServiceWorker, Worklet.',
      '- Positive example: compute values, print diagnostics via console.*.',
      '- Negative example: trying window.open/fetch/window.api must return policy_denied.',
      '- When error.code is limit_exceeded, reduce code size/complexity or split work into multiple tool calls.',
      '- When stderr warns about throttling/degraded mode, treat results as potentially slower/partial.',
    ].join('\n');
  }

  getTools(): LLMTool[] {
    return [
      {
        name: 'code_exec',
        description:
          'Execute JavaScript in isolated sandbox runtime with strict policy and resource limits.',
        parameters: CODE_EXEC_TOOL_SCHEMA,
        execute: async (args: Record<string, unknown>, signal?: AbortSignal) => {
          const validated = validateCodeExecInput(args);
          if (!validated.ok) {
            throw new Error(validated.error?.message ?? 'Invalid code_exec arguments.');
          }

          const toolCallId = `code_exec_${Date.now()}_${Math.random().toString(16).slice(2)}`;
          const output = await this.sandboxSessionManager.execute(
            'runtime',
            toolCallId,
            args,
            signal
          );
          return output;
        },
      },
    ];
  }
}
