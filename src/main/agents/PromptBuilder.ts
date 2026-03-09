// Requirements: llm-integration.4
// src/main/agents/PromptBuilder.ts
// Builds LLM prompts from agent history and features

import type { Message } from '../db/schema';
import type { LLMTool, ChatMessage } from '../llm/ILLMProvider';

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
    return parts.join('\n\n');
  }

  private collectTools(): LLMTool[] {
    return this.features.flatMap((f) => f.getTools());
  }

  private buildHistoryMessages(messages: Message[]): ChatMessage[] {
    const selected = this.historyStrategy.select(messages);
    const history: ChatMessage[] = [];

    for (const msg of selected) {
      if (msg.hidden || (msg.kind !== 'user' && msg.kind !== 'llm')) {
        continue;
      }
      const payload = this.parsePayload(msg.payloadJson);
      const content = this.messageContentForReplay(msg.kind, payload);
      if (!content) {
        continue;
      }
      history.push({
        role: msg.kind === 'user' ? 'user' : 'assistant',
        content,
      });
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
      'When you consider the user task completed, call the `final_answer` tool.',
      'Provide the final user-facing text in `text`.',
      'Optionally provide `summary_points` as short bullet points (target: up to 10 points, target: up to 200 characters each).',
      'These limits are guidance for generation quality; if they are exceeded, the response is still accepted.',
    ].join(' ');
  }

  getTools(): LLMTool[] {
    return [
      {
        name: 'final_answer',
        description:
          'Marks task completion and returns final user-facing response with optional summary points.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            text: {
              type: 'string',
              description: 'Final user-facing response text.',
            },
            summary_points: {
              type: 'array',
              description:
                'Optional concise summary bullet points (target: up to 10 points, up to 200 characters each).',
              items: {
                type: 'string',
              },
            },
          },
          required: ['text'],
        },
        // Keep execution deterministic and side-effect free.
        execute: async (args: Record<string, unknown>) => args,
      },
    ];
  }
}
