// Requirements: llm-integration.4
// tests/unit/agents/PromptBuilder.test.ts
// Unit tests for PromptBuilder

import {
  PromptBuilder,
  FullHistoryStrategy,
  AgentFeature,
} from '../../../src/main/agents/PromptBuilder';
import type { LLMTool } from '../../../src/main/llm/ILLMProvider';
import type { Message } from '../../../src/main/db/schema';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMessage(overrides: Partial<Message> & { id: number }): Message {
  return {
    agentId: 'agent-1',
    kind: 'user',
    timestamp: '2026-02-15T10:00:00.000Z',
    payloadJson: JSON.stringify({ data: { text: 'Hello', reply_to_message_id: null } }),
    ...overrides,
  };
}

function makeBuilder(
  systemPrompt = 'You are a helpful AI assistant.',
  features: AgentFeature[] = []
): PromptBuilder {
  return new PromptBuilder(systemPrompt, features, new FullHistoryStrategy());
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FullHistoryStrategy', () => {
  /* Preconditions: Strategy initialized
     Action: Call select() with messages
     Assertions: Returns all messages unchanged
     Requirements: llm-integration.4.2 */
  it('should return all messages', () => {
    const strategy = new FullHistoryStrategy();
    const msgs = [makeMessage({ id: 1 }), makeMessage({ id: 2 })];
    expect(strategy.select(msgs)).toEqual(msgs);
  });

  it('should return empty array for empty input', () => {
    expect(new FullHistoryStrategy().select([])).toEqual([]);
  });
});

describe('PromptBuilder.build()', () => {
  describe('empty history', () => {
    /* Preconditions: No messages
       Action: Call build([])
       Assertions: history is empty string, systemPrompt is base prompt
       Requirements: llm-integration.4.3 */
    it('should return empty history and base system prompt', () => {
      const result = makeBuilder().build([]);
      expect(result.history).toBe('');
      expect(result.systemPrompt).toBe('You are a helpful AI assistant.');
      expect(result.tools).toEqual([]);
    });
  });

  describe('system prompt with features', () => {
    /* Preconditions: Two features with system prompt sections
       Action: Call build([])
       Assertions: systemPrompt concatenates base + feature sections
       Requirements: llm-integration.4.1 */
    it('should concatenate base prompt with feature sections', () => {
      const feature1: AgentFeature = {
        name: 'f1',
        getSystemPromptSection: () => 'Feature 1 instructions.',
        getTools: () => [],
      };
      const feature2: AgentFeature = {
        name: 'f2',
        getSystemPromptSection: () => 'Feature 2 instructions.',
        getTools: () => [],
      };
      const result = makeBuilder('Base prompt.', [feature1, feature2]).build([]);
      expect(result.systemPrompt).toBe(
        'Base prompt.\n\nFeature 1 instructions.\n\nFeature 2 instructions.'
      );
    });

    /* Preconditions: Feature with empty system prompt section
       Action: Call build([])
       Assertions: Empty sections are not added
       Requirements: llm-integration.4.1 */
    it('should skip empty feature sections', () => {
      const feature: AgentFeature = {
        name: 'empty',
        getSystemPromptSection: () => '',
        getTools: () => [],
      };
      const result = makeBuilder('Base.', [feature]).build([]);
      expect(result.systemPrompt).toBe('Base.');
    });
  });

  describe('tools collection', () => {
    /* Preconditions: Features with tools
       Action: Call build([])
       Assertions: tools array contains all tools from all features
       Requirements: llm-integration.4.1 */
    it('should collect tools from all features', () => {
      const tool1: LLMTool = { name: 'tool1', description: 'T1', parameters: {} };
      const tool2: LLMTool = { name: 'tool2', description: 'T2', parameters: {} };
      const feature1: AgentFeature = {
        name: 'f1',
        getSystemPromptSection: () => '',
        getTools: () => [tool1],
      };
      const feature2: AgentFeature = {
        name: 'f2',
        getSystemPromptSection: () => '',
        getTools: () => [tool2],
      };
      const result = makeBuilder('Base.', [feature1, feature2]).build([]);
      expect(result.tools).toEqual([tool1, tool2]);
    });
  });

  describe('YAML history serialization', () => {
    /* Preconditions: User and LLM messages exist
       Action: Call build(messages)
       Assertions: history contains correct YAML with id, kind, timestamp, data
       Requirements: llm-integration.4.3, llm-integration.4.4 */
    it('should serialize user and llm messages to YAML', () => {
      const msgs = [
        makeMessage({
          id: 1,
          kind: 'user',
          payloadJson: JSON.stringify({ data: { text: 'Hello', reply_to_message_id: null } }),
        }),
        makeMessage({
          id: 2,
          kind: 'llm',
          payloadJson: JSON.stringify({
            data: {
              reply_to_message_id: 1,
              action: { type: 'text', content: 'Hi there!' },
            },
          }),
        }),
      ];

      const { history } = makeBuilder().build(msgs);

      expect(history).toContain('messages:');
      expect(history).toContain('id: 1');
      expect(history).toContain('kind: user');
      expect(history).toContain('id: 2');
      expect(history).toContain('kind: llm');
    });

    /* Preconditions: LLM message with reasoning and model fields
       Action: Call build(messages)
       Assertions: reasoning.text and model are excluded from YAML
       Requirements: llm-integration.4.4 */
    it('should exclude reasoning.text and model from llm messages', () => {
      const msgs = [
        makeMessage({
          id: 1,
          kind: 'llm',
          payloadJson: JSON.stringify({
            data: {
              reply_to_message_id: null,
              model: 'gpt-5.2',
              reasoning: { text: 'My internal thoughts', excluded_from_replay: true },
              action: { type: 'text', content: 'Answer' },
            },
          }),
        }),
      ];

      const { history } = makeBuilder().build(msgs);

      expect(history).not.toContain('model');
      expect(history).not.toContain('My internal thoughts');
      expect(history).not.toContain('excluded_from_replay');
      expect(history).toContain('Answer');
    });

    /* Preconditions: LLM message with interrupted:true
       Action: Call build(messages)
       Assertions: interrupted field is present in YAML
       Requirements: llm-integration.4.4 */
    it('should include interrupted:true in llm messages', () => {
      const msgs = [
        makeMessage({
          id: 1,
          kind: 'llm',
          payloadJson: JSON.stringify({
            data: {
              reply_to_message_id: null,
              interrupted: true,
              action: { type: 'text', content: 'Partial' },
            },
          }),
        }),
      ];

      const { history } = makeBuilder().build(msgs);
      expect(history).toContain('interrupted');
    });

    /* Preconditions: First message in chat
       Action: Call build(messages)
       Assertions: reply_to_message_id is null in YAML
       Requirements: llm-integration.4.4 */
    it('should include reply_to_message_id: null for first message', () => {
      const msgs = [
        makeMessage({
          id: 1,
          kind: 'user',
          payloadJson: JSON.stringify({ data: { text: 'First', reply_to_message_id: null } }),
        }),
      ];

      const { history } = makeBuilder().build(msgs);
      expect(history).toContain('reply_to_message_id');
      expect(history).toContain('null');
    });
  });
});

describe('PromptBuilder edge cases', () => {
  describe('messageToChat with error kind', () => {
    /* Preconditions: Message with kind 'error'
       Action: Call buildMessages(messages)
       Assertions: Error message mapped to system role with kind prefix
       Requirements: llm-integration.4.3 */
    it('should map error kind to system role', () => {
      const msgs = [
        makeMessage({
          id: 1,
          kind: 'error',
          payloadJson: JSON.stringify({ data: { error: { message: 'Something failed' } } }),
        }),
      ];
      const chatMessages = makeBuilder().buildMessages(msgs);
      const systemMsgs = chatMessages.filter((m) => m.role === 'system');
      const errorMsg = systemMsgs.find((m) => m.content.includes('[error]'));
      expect(errorMsg).toBeDefined();
    });
  });

  describe('yamlValue with object', () => {
    /* Preconditions: LLM message with nested action object
       Action: Call build(messages)
       Assertions: Object values serialized as JSON in YAML
       Requirements: llm-integration.4.4 */
    it('should serialize nested objects as JSON in YAML', () => {
      const msgs = [
        makeMessage({
          id: 1,
          kind: 'llm',
          payloadJson: JSON.stringify({
            data: {
              reply_to_message_id: null,
              action: { type: 'text', content: 'Hello' },
            },
          }),
        }),
      ];
      const { history } = makeBuilder().build(msgs);
      // action is an object — should be JSON-serialized
      expect(history).toContain('action');
      expect(history).toContain('text');
    });
  });
});

describe('PromptBuilder.buildMessages()', () => {
  /* Preconditions: User and LLM messages exist
     Action: Call buildMessages(messages)
     Assertions: Returns ChatMessage[] with system + user/assistant roles
     Requirements: llm-integration.4.3 */
  it('should return system message followed by user/assistant messages', () => {
    const msgs = [
      makeMessage({
        id: 1,
        kind: 'user',
        payloadJson: JSON.stringify({ data: { text: 'Hello' } }),
      }),
      makeMessage({
        id: 2,
        kind: 'llm',
        payloadJson: JSON.stringify({
          data: { action: { type: 'text', content: 'Hi!' } },
        }),
      }),
    ];

    const chatMessages = makeBuilder().buildMessages(msgs);

    expect(chatMessages[0].role).toBe('system');
    expect(chatMessages[0].content).toContain('helpful AI assistant');

    const userMsg = chatMessages.find((m) => m.role === 'user');
    expect(userMsg?.content).toBe('Hello');

    const assistantMsg = chatMessages.find((m) => m.role === 'assistant');
    expect(assistantMsg?.content).toBe('Hi!');
  });

  /* Preconditions: No messages
     Action: Call buildMessages([])
     Assertions: Returns only system message
     Requirements: llm-integration.4.3 */
  it('should return only system message for empty history', () => {
    const chatMessages = makeBuilder().buildMessages([]);
    expect(chatMessages).toHaveLength(1);
    expect(chatMessages[0].role).toBe('system');
  });
});
