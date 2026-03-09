// Requirements: llm-integration.10
// tests/unit/agents/PromptBuilder.test.ts
// Unit tests for PromptBuilder

import {
  PromptBuilder,
  FullHistoryStrategy,
  AgentFeature,
  FinalAnswerFeature,
} from '../../../src/main/agents/PromptBuilder';
import type { LLMTool } from '../../../src/main/llm/ILLMProvider';
import type { Message } from '../../../src/main/db/schema';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMessage(overrides: Partial<Message> & { id: number }): Message {
  return {
    agentId: 'agent-1',
    kind: 'user',
    timestamp: '2026-02-15T10:00:00.000Z',
    payloadJson: JSON.stringify({ data: { text: 'Hello' } }),
    usageJson: null,
    replyToMessageId: null,
    hidden: false,
    done: true,
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
     Requirements: llm-integration.10.1 */
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
       Action: Call build()
       Assertions: systemPrompt is base prompt and tools are empty
       Requirements: llm-integration.10.4 */
    it('should return base system prompt and empty tools', () => {
      const result = makeBuilder().build();
      expect(result.systemPrompt).toBe('You are a helpful AI assistant.');
      expect(result.tools).toEqual([]);
    });
  });

  describe('system prompt with features', () => {
    /* Preconditions: Two features with system prompt sections
       Action: Call build()
       Assertions: systemPrompt concatenates base + feature sections
       Requirements: llm-integration.10.4 */
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
      const result = makeBuilder('Base prompt.', [feature1, feature2]).build();
      expect(result.systemPrompt).toBe(
        'Base prompt.\n\nFeature 1 instructions.\n\nFeature 2 instructions.'
      );
    });

    /* Preconditions: Feature with empty system prompt section
       Action: Call build()
       Assertions: Empty sections are not added
       Requirements: llm-integration.10.4 */
    it('should skip empty feature sections', () => {
      const feature: AgentFeature = {
        name: 'empty',
        getSystemPromptSection: () => '',
        getTools: () => [],
      };
      const result = makeBuilder('Base.', [feature]).build();
      expect(result.systemPrompt).toBe('Base.');
    });
  });

  describe('tools collection', () => {
    /* Preconditions: Features with tools
       Action: Call build()
       Assertions: tools array contains all tools from all features
       Requirements: llm-integration.10.4 */
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
      const result = makeBuilder('Base.', [feature1, feature2]).build();
      expect(result.tools).toEqual([tool1, tool2]);
    });

    /* Preconditions: FinalAnswerFeature configured
       Action: Call build()
       Assertions: final_answer tool and guidance section are present
       Requirements: llm-integration.9.2, llm-integration.9.5.1.1.1, llm-integration.9.5.1.1.2, llm-integration.9.5.1.1.3, llm-integration.11.2.1 */
    it('should include final_answer tool and prompt guidance from FinalAnswerFeature', () => {
      const feature = new FinalAnswerFeature();
      const result = makeBuilder('Base.', [feature]).build();
      expect(result.systemPrompt).toContain('final_answer');
      expect(result.systemPrompt).toContain('Use normal assistant text for ongoing dialog');
      expect(result.systemPrompt).toContain('Call the `final_answer` tool only when you are confident');
      expect(result.systemPrompt).toContain('explicitly state that the work is completed');
      expect(result.systemPrompt).toContain('list solved tasks');
      expect(result.tools.some((tool) => tool.name === 'final_answer')).toBe(true);
      const finalAnswerTool = result.tools.find((tool) => tool.name === 'final_answer');
      expect(finalAnswerTool?.description).toContain('only after task is fully done');
      expect(finalAnswerTool?.parameters).toMatchObject({
        properties: {
          text: expect.objectContaining({
            minLength: 1,
            maxLength: 300,
            description: expect.stringContaining('explicitly says the work is done'),
          }),
          summary_points: expect.objectContaining({
            maxItems: 10,
            description: expect.stringContaining('list of solved tasks'),
            items: expect.objectContaining({ maxLength: 200 }),
          }),
        },
      });
    });
  });

  describe('history serialization for provider messages', () => {
    /* Preconditions: User and LLM messages exist
       Action: Call build(messages)
       Assertions: buildMessages contains separate user/assistant entries
       Requirements: llm-integration.10.1, llm-integration.10.2, llm-integration.10.4 */
    it('should serialize user and llm messages into separate chat messages', () => {
      const msgs = [
        makeMessage({
          id: 1,
          kind: 'user',
          payloadJson: JSON.stringify({ data: { text: 'Hello' } }),
          replyToMessageId: null,
        }),
        makeMessage({
          id: 2,
          kind: 'llm',
          payloadJson: JSON.stringify({
            data: {
              text: 'Hi there!',
            },
          }),
          replyToMessageId: 1,
        }),
      ];

      const chatMessages = makeBuilder().buildMessages(msgs);

      expect(chatMessages).toHaveLength(3);
      expect(chatMessages[1]).toMatchObject({ role: 'user' });
      expect(chatMessages[2]).toMatchObject({ role: 'assistant' });
      expect(chatMessages[1].content).toContain('Hello');
      expect(chatMessages[2].content).toContain('Hi there!');
    });

    /* Preconditions: LLM message with model and reasoning* fields
       Action: Call build(messages)
       Assertions: model and all reasoning* fields are excluded from replayed content
       Requirements: llm-integration.10.2 */
    it('should exclude model and all reasoning-prefixed fields from llm messages', () => {
      const msgs = [
        makeMessage({
          id: 1,
          kind: 'llm',
          payloadJson: JSON.stringify({
            data: {
              model: 'gpt-5.2',
              reasoning: { text: 'My internal thoughts', excluded_from_replay: true },
              reasoning_summary: 'summary',
              reasoning_tokens: 123,
              text: 'Answer',
            },
          }),
          replyToMessageId: null,
        }),
      ];

      const chatMessages = makeBuilder().buildMessages(msgs);
      const assistant = chatMessages.find((m) => m.role === 'assistant');
      expect(assistant).toBeDefined();
      expect(assistant!.content).not.toContain('model');
      expect(assistant!.content).not.toContain('My internal thoughts');
      expect(assistant!.content).not.toContain('reasoning');
      expect(assistant!.content).not.toContain('reasoning_summary');
      expect(assistant!.content).not.toContain('reasoning_tokens');
      expect(assistant!.content).not.toContain('excluded_from_replay');
      expect(assistant!.content).toContain('Answer');
    });
  });
});

describe('PromptBuilder edge cases', () => {
  describe('llm messages without replayable content', () => {
    /* Preconditions: LLM message lacks replayable data.text
       Action: Call build(messages)
       Assertions: Message is excluded from replay history
       Requirements: llm-integration.10.2, llm-integration.10.3 */
    it('should skip llm message when replayable content is absent', () => {
      const msgs = [
        makeMessage({
          id: 1,
          kind: 'llm',
          payloadJson: JSON.stringify({
            data: {
              text: '',
              note: 'Hello',
            },
          }),
          replyToMessageId: null,
        }),
      ];
      const chatMessages = makeBuilder().buildMessages(msgs);
      const assistant = chatMessages.find((m) => m.role === 'assistant');
      expect(assistant).toBeUndefined();
      expect(chatMessages).toHaveLength(1);
    });
  });

  describe('hidden messages', () => {
    /* Preconditions: History contains hidden user/llm messages
       Action: Call buildMessages(messages)
       Assertions: Hidden messages are excluded from replay history
       Requirements: llm-integration.10.3 */
    it('should exclude hidden messages from replay history', () => {
      const msgs = [
        makeMessage({
          id: 1,
          kind: 'user',
          hidden: true,
          payloadJson: JSON.stringify({ data: { text: 'Hidden user' } }),
        }),
        makeMessage({
          id: 2,
          kind: 'llm',
          hidden: true,
          payloadJson: JSON.stringify({ data: { text: 'Hidden llm' } }),
        }),
      ];

      const chatMessages = makeBuilder().buildMessages(msgs);
      expect(chatMessages).toHaveLength(1);
      expect(chatMessages[0].role).toBe('system');
    });
  });
});

describe('PromptBuilder.buildMessages()', () => {
  /* Preconditions: User and LLM messages exist
     Action: Call buildMessages(messages)
     Assertions: Returns system message + separate history messages
     Requirements: llm-integration.10.1, llm-integration.10.4 */
  it('should return system message followed by separate history messages', () => {
    const msgs = [
      makeMessage({
        id: 1,
        kind: 'user',
        payloadJson: JSON.stringify({ data: { text: 'Hello' } }),
      }),
      makeMessage({
        id: 2,
        kind: 'llm',
        payloadJson: JSON.stringify({ data: { text: 'Hi!' } }),
      }),
    ];

    const chatMessages = makeBuilder().buildMessages(msgs);

    expect(chatMessages[0].role).toBe('system');
    expect(chatMessages[0].content).toContain('helpful AI assistant');
    expect(chatMessages).toHaveLength(3);
    expect(chatMessages[1].role).toBe('user');
    expect(chatMessages[1].content).toContain('Hello');
    expect(chatMessages[2].role).toBe('assistant');
    expect(chatMessages[2].content).toContain('Hi!');
  });

  /* Preconditions: No messages
     Action: Call buildMessages([])
     Assertions: Returns only system message
     Requirements: llm-integration.10.4 */
  it('should return only system message for empty history', () => {
    const chatMessages = makeBuilder().buildMessages([]);
    expect(chatMessages).toHaveLength(1);
    expect(chatMessages[0].role).toBe('system');
  });

  /* Preconditions: History contains kind:tool_call message
     Action: Call buildMessages() with user + tool_call + llm
     Assertions: tool_call is excluded from model history
     Requirements: llm-integration.10.1 */
  it('should ignore tool_call messages in model history', () => {
    const msgs = [
      makeMessage({
        id: 1,
        kind: 'user',
        payloadJson: JSON.stringify({ data: { text: 'Question' } }),
      }),
      makeMessage({
        id: 2,
        kind: 'tool_call',
        payloadJson: JSON.stringify({ data: { toolName: 'search_docs' } }),
      }),
      makeMessage({
        id: 3,
        kind: 'llm',
        payloadJson: JSON.stringify({ data: { text: 'Answer' } }),
      }),
    ];

    const chatMessages = makeBuilder().buildMessages(msgs);
    expect(chatMessages).toHaveLength(3);
    expect(chatMessages[1].role).toBe('user');
    expect(chatMessages[2].role).toBe('assistant');
  });
});
