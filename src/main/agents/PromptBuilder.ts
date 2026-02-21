// Requirements: llm-integration.4
// src/main/agents/PromptBuilder.ts
// Builds LLM prompts from agent history and features

import type { Message } from '../db/schema';
import type { LLMTool, ChatMessage } from '../llm/ILLMProvider';

// ─── Interfaces ──────────────────────────────────────────────────────────────

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
  /** YAML-serialized message history */
  history: string;
  /** All tools from all features */
  tools: LLMTool[];
}

// ─── FullHistoryStrategy ─────────────────────────────────────────────────────

/**
 * Returns all messages as-is (MVP strategy)
 * Requirements: llm-integration.4.2
 */
export class FullHistoryStrategy implements HistoryStrategy {
  select(messages: Message[]): Message[] {
    return messages;
  }
}

// ─── PromptBuilder ───────────────────────────────────────────────────────────

/**
 * Builds LLM prompts from agent history and features.
 *
 * - Combines base system prompt with feature sections
 * - Serializes message history to YAML
 * - Collects tools from all features
 * - Excludes reasoning.text and model from YAML (excluded_from_replay)
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
   * Build the full prompt from messages
   * Requirements: llm-integration.4.3
   */
  build(messages: Message[]): BuiltPrompt {
    const selected = this.historyStrategy.select(messages);

    return {
      systemPrompt: this.buildSystemPrompt(),
      history: this.serializeHistory(selected),
      tools: this.collectTools(),
    };
  }

  /**
   * Build system prompt as ChatMessage[] for the LLM API
   * Combines base prompt + all feature sections
   * Requirements: llm-integration.4.1
   */
  buildMessages(messages: Message[]): ChatMessage[] {
    const { systemPrompt, history } = this.build(messages);
    const result: ChatMessage[] = [{ role: 'system', content: systemPrompt }];
    if (history) {
      result.push({ role: 'system', content: `Conversation history:\n${history}` });
    }
    // Convert each message to a chat message for the LLM
    // Filter out kind:error messages
    // Requirements: llm-integration.3.9
    const selected = this.historyStrategy.select(messages);
    for (const msg of selected) {
      if (msg.kind === 'error') continue;
      result.push(this.messageToChat(msg));
    }
    return result;
  }

  // ─── Private ───────────────────────────────────────────────────────────────

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

  /**
   * Serialize messages to YAML string
   * Excludes reasoning.text and model fields (excluded_from_replay)
   * Excludes kind:error messages (llm-integration.3.9)
   * Hidden messages are already excluded at the DB query level (llm-integration.3.8, llm-integration.8.6)
   * Requirements: llm-integration.4.4, llm-integration.3.9
   */
  private serializeHistory(messages: Message[]): string {
    if (messages.length === 0) return '';

    const filtered = messages.filter((msg) => {
      // Exclude kind:error messages — llm-integration.3.9
      if (msg.kind === 'error') return false;
      return true;
    });

    if (filtered.length === 0) return '';

    const lines: string[] = ['messages:'];
    for (const msg of filtered) {
      lines.push(...this.serializeMessage(msg));
    }
    return lines.join('\n');
  }

  private serializeMessage(msg: Message): string[] {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(msg.payloadJson) as Record<string, unknown>;
    } catch {
      // ignore parse errors — use empty payload
    }

    const data = this.sanitizeData(msg.kind, payload.data as Record<string, unknown> | undefined);

    const lines: string[] = [
      `  - id: ${msg.id}`,
      `    kind: ${msg.kind}`,
      `    timestamp: "${msg.timestamp}"`,
      `    data:`,
    ];

    for (const [key, value] of Object.entries(data)) {
      lines.push(`      ${key}: ${this.yamlValue(value)}`);
    }

    return lines;
  }

  /**
   * Remove fields excluded from replay (reasoning.text, model)
   * Requirements: llm-integration.4.4
   */
  private sanitizeData(
    kind: string,
    data: Record<string, unknown> | undefined
  ): Record<string, unknown> {
    if (!data) return {};

    const result: Record<string, unknown> = { ...data };

    if (kind === 'llm') {
      // Remove model field
      delete result['model'];

      // Remove reasoning.text (excluded_from_replay)
      if (result['reasoning'] && typeof result['reasoning'] === 'object') {
        const reasoning = { ...(result['reasoning'] as Record<string, unknown>) };
        delete reasoning['text'];
        delete reasoning['excluded_from_replay'];
        // Only keep reasoning in output if there are remaining fields
        if (Object.keys(reasoning).length > 0) {
          result['reasoning'] = reasoning;
        } else {
          delete result['reasoning'];
        }
      }
    }

    return result;
  }

  /**
   * Convert a DB Message to a ChatMessage for the LLM API
   * Requirements: llm-integration.4.3
   */
  private messageToChat(msg: Message): ChatMessage {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(msg.payloadJson) as Record<string, unknown>;
    } catch {
      // ignore
    }

    const data = payload.data as Record<string, unknown> | undefined;

    if (msg.kind === 'user') {
      const text = typeof data?.['text'] === 'string' ? data['text'] : '';
      return { role: 'user', content: text };
    }

    if (msg.kind === 'llm') {
      const action = data?.['action'] as Record<string, unknown> | undefined;
      const content = typeof action?.['content'] === 'string' ? action['content'] : '';
      return { role: 'assistant', content };
    }

    // error or other kinds — include as system note
    return { role: 'system', content: `[${msg.kind}] ${JSON.stringify(data ?? {})}` };
  }

  /**
   * Minimal YAML value serializer
   */
  private yamlValue(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return String(value);
    if (typeof value === 'number') return String(value);
    if (typeof value === 'string') return `"${value.replace(/"/g, '\\"')}"`;
    return JSON.stringify(value);
  }
}
