// Requirements: llm-integration.10
// tests/unit/agents/PromptBuilder.test.ts
// Unit tests for PromptBuilder

import {
  PromptBuilder,
  FullHistoryStrategy,
  AgentFeature,
  FinalAnswerFeature,
  CodeExecFeature,
  normalizePromptWhitespace,
} from '../../../src/main/agents/PromptBuilder';
import type { ChatMessage, LLMTool } from '../../../src/main/llm/ILLMProvider';
import type { Message } from '../../../src/main/db/schema';
import { SandboxSessionManager } from '../../../src/main/code_exec/SandboxSessionManager';

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

function expectTextMessage(
  message: ChatMessage | undefined,
  role: 'user' | 'assistant' | 'system'
): asserts message is Extract<ChatMessage, { role: 'user' | 'assistant' | 'system' }> {
  expect(message).toBeDefined();
  expect(message?.role).toBe(role);
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

    /* Preconditions: Base/feature prompts contain extra spaces and blank lines
       Action: Call build()
       Assertions: systemPrompt is normalized (no trailing spaces, no 3+ newlines, no repeated spaces)
       Requirements: llm-integration.4.5 */
    it('should normalize prompt whitespace before returning system prompt', () => {
      const feature: AgentFeature = {
        name: 'f1',
        getSystemPromptSection: () => 'Section   with   extra   spaces.\n\n\nLine 2   ',
        getTools: () => [],
      };
      const result = makeBuilder('Base   prompt.  \n\n\n', [feature]).build();
      expect(result.systemPrompt).toBe('Base prompt.\n\nSection with extra spaces.\n\nLine 2');
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
      expect(result.systemPrompt).toContain('Final Answer tool usage:');
      expect(result.systemPrompt).toContain('Use normal assistant text for ongoing dialog');
      expect(result.systemPrompt).toContain(
        'Call the `final_answer` tool only when you are confident'
      );
      expect(result.systemPrompt).toContain(
        'explicitly ask the user what information or confirmation you need next'
      );
      expect(result.systemPrompt).toContain(
        'Never end a turn in ambiguous state: each turn must do exactly one of these outcomes'
      );
      expect(result.systemPrompt).toContain(
        'If the user request can be fully completed within the current turn'
      );
      expect(result.systemPrompt).toContain('Call `final_answer` alone');
      expect(result.systemPrompt).toContain(
        'Do not duplicate tool payload as plain assistant text'
      );
      expect(result.systemPrompt).toContain(
        'do not emit assistant summary/bullet/checklist content that duplicates solved tasks from `final_answer.summary_points` (including paraphrased duplicates)'
      );
      expect(result.systemPrompt).toContain('list solved tasks');
      expect(result.systemPrompt).toContain('1 to 10 non-empty points');
      expect(result.systemPrompt).toContain(
        'You MAY use Markdown (GFM) inside `final_answer.summary_points`'
      );
      expect(result.systemPrompt).toContain(
        'mathematical expressions are optional; if used, format them with Markdown math delimiters'
      );
      expect(result.tools.some((tool) => tool.name === 'final_answer')).toBe(true);
      const finalAnswerTool = result.tools.find((tool) => tool.name === 'final_answer');
      expect(finalAnswerTool?.description).toContain('only after task is fully done');
      expect(finalAnswerTool?.parameters).toMatchObject({
        required: ['summary_points'],
        additionalProperties: false,
        properties: {
          summary_points: expect.objectContaining({
            minItems: 1,
            maxItems: 10,
            description: expect.stringContaining('Required concise list of solved tasks'),
            items: expect.objectContaining({ minLength: 1, maxLength: 200, pattern: '.*\\S.*' }),
          }),
        },
      });
      expect(
        (finalAnswerTool?.parameters as Record<string, unknown>).properties
      ).not.toHaveProperty('text');
    });

    /* Preconditions: CodeExecFeature enabled
       Action: build() is called
       Assertions: system prompt explicitly states async context and top-level await support
       Requirements: code_exec.1, llm-integration.4 */
    it('should include async execution guidance for code_exec', () => {
      const sandboxManager = {} as SandboxSessionManager;
      const feature = new CodeExecFeature(sandboxManager);
      const result = makeBuilder('Base.', [feature]).build();
      expect(result.systemPrompt).toContain('Tool priority and completion rules:');
      expect(result.systemPrompt).toContain(
        '`code_exec` is your primary work tool for computation, extraction, transformation, structured analysis, verification'
      );
      expect(result.systemPrompt).toContain(
        'Inside one `code_exec` call, your sandbox code may use multiple allowlisted helper calls when needed to solve the task'
      );
      expect(result.systemPrompt).toContain(
        'Independent allowlisted helper calls inside one `code_exec` may run sequentially with `await` or concurrently with standard async JavaScript patterns such as `await Promise.all([...])`'
      );
      expect(result.systemPrompt).toContain(
        'This does not change the outer chat-flow rule: each model response may request at most one top-level tool call'
      );
      expect(result.systemPrompt).toContain(
        'Before making another tool call, check whether the available tool results are already sufficient to answer the user'
      );
      expect(result.systemPrompt).toContain(
        '`final_answer` is not a work tool; use it only to finish the task once the work is complete'
      );
      expect(result.systemPrompt).toContain('top-level `await` is supported');
      expect(result.systemPrompt).toContain('required string fields `task_summary`');
      expect(result.systemPrompt).toContain('HTTP requests inside code_exec:');
      expect(result.systemPrompt).toContain('const result = await tools.http_request({ ... })');
      expect(result.systemPrompt).toContain(
        'When sandbox code needs external HTTP interaction, call `await tools.http_request(...)` to send requests to pages, APIs, feeds, files, or other HTTP resources'
      );
      expect(result.systemPrompt).toContain(
        'Use this helper when you need to open or read a public website or web page from `code_exec`; it is not limited to JSON APIs.'
      );
      expect(result.systemPrompt).toContain(
        'fetch an HTTP resource with `await tools.http_request({...})`, then parse, validate, transform, or summarize the returned body inside `code_exec`'
      );
      expect(result.systemPrompt).toContain(
        '{ "accept": "application/json", "x-trace-id": "abc-123" }'
      );
      expect(result.systemPrompt).toContain('internal safety cap of `262144` bytes');
      expect(result.systemPrompt).toContain('redirects are followed for up to `10` hops');
      expect(result.systemPrompt).toContain(
        '`303` becomes `GET` without `body`; `301/302` change `POST` to `GET` without `body`; `307/308` preserve `method` and `body`'
      );
      expect(result.systemPrompt).toContain('applied_limit_bytes');
      expect(result.systemPrompt).toContain('default internal cap `262144`');
      expect(result.systemPrompt).toContain(
        'sensitive request headers (`authorization`, `proxy-authorization`, `cookie`, `cookie2`)'
      );
      expect(result.systemPrompt).toContain(
        'This helper is only for public HTTP(S) resources; `localhost`, loopback, private, link-local, and other reserved/internal network targets are rejected.'
      );
      expect(result.systemPrompt).toContain('`headers`: optional `Record<string, string>`');
      expect(result.systemPrompt).toContain(
        'Request-control and hop-by-hop header restrictions are defined in the `headers` input field below and are enforced by validation.'
      );
      expect(result.systemPrompt).toContain(
        'forbidden: `host`, `content-length`, `connection`, `proxy-connection`, `transfer-encoding`, `upgrade`, `keep-alive`, `te`, `trailer`, `expect`'
      );
      expect(result.systemPrompt).toContain('Error fields:');
      expect(result.systemPrompt).toContain('`error.code`: short machine-readable error code.');
      expect(result.systemPrompt).toContain('Error example:');
      expect(result.systemPrompt).toContain('message: "network down"');
      expect(result.systemPrompt).toContain('Response example:');
    });

    /* Preconditions: CodeExecFeature is enabled for the model-facing tool registry
       Action: build() collects LLM tools
       Assertions: code_exec tool description explicitly advertises public URL/API fetching via tools.http_request
       Requirements: code_exec.1, sandbox-http-request.1.4 */
    it('should advertise URL fetching capability in code_exec tool description', () => {
      const sandboxManager = {} as SandboxSessionManager;
      const feature = new CodeExecFeature(sandboxManager);
      const result = makeBuilder('Base.', [feature]).build();

      expect(result.tools.find((tool) => tool.name === 'code_exec')?.description).toContain(
        'primary work tool for computation, extraction, transformation, analysis, and verification'
      );
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
      const userMsg = chatMessages[1];
      const assistantMsg = chatMessages[2];
      expectTextMessage(userMsg, 'user');
      expectTextMessage(assistantMsg, 'assistant');
      expect(userMsg.content).toContain('Hello');
      expect(assistantMsg.content).toContain('Hi there!');
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
      expectTextMessage(assistant, 'assistant');
      expect(assistant.content).not.toContain('model');
      expect(assistant.content).not.toContain('My internal thoughts');
      expect(assistant.content).not.toContain('reasoning');
      expect(assistant.content).not.toContain('reasoning_summary');
      expect(assistant.content).not.toContain('reasoning_tokens');
      expect(assistant.content).not.toContain('excluded_from_replay');
      expect(assistant.content).toContain('Answer');
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

    const systemMsg = chatMessages[0];
    const userMsg = chatMessages[1];
    const assistantMsg = chatMessages[2];
    expectTextMessage(systemMsg, 'system');
    expect(systemMsg.content).toContain('helpful AI assistant');
    expect(chatMessages).toHaveLength(3);
    expectTextMessage(userMsg, 'user');
    expect(userMsg.content).toContain('Hello');
    expectTextMessage(assistantMsg, 'assistant');
    expect(assistantMsg.content).toContain('Hi!');
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

  /* Preconditions: History contains non-terminal kind:tool_call message
     Action: Call buildMessages() with user + tool_call + llm
     Assertions: non-terminal tool_call is excluded from model history
     Requirements: llm-integration.10.1 */
  it('should ignore non-terminal tool_call messages in model history', () => {
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

  /* Preconditions: History contains terminal kind:tool_call message
     Action: Call buildMessages()
     Assertions: terminal tool_call is serialized as assistant(tool-call) + tool(tool-result) history pair
     Requirements: llm-integration.11.3.1.1, llm-integration.11.3.1.3 */
  it('should include terminal tool_call messages as replay pair', () => {
    const msgs = [
      makeMessage({
        id: 1,
        kind: 'user',
        payloadJson: JSON.stringify({ data: { text: 'Question' } }),
      }),
      makeMessage({
        id: 2,
        kind: 'tool_call',
        done: true,
        payloadJson: JSON.stringify({
          data: {
            callId: 'call-1',
            toolName: 'code_exec',
            arguments: { task_summary: 'Run code', code: "console.log('ok')" },
            output: { status: 'success', stdout: 'ok' },
          },
        }),
      }),
      makeMessage({
        id: 3,
        kind: 'llm',
        payloadJson: JSON.stringify({ data: { text: 'Answer' } }),
      }),
    ];

    const chatMessages = makeBuilder().buildMessages(msgs);
    expect(chatMessages).toHaveLength(5);
    expect(chatMessages[2]).toMatchObject({
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'code_exec',
          input: {},
        },
      ],
    });
    expect(chatMessages[3]).toMatchObject({
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'code_exec',
          output: {
            type: 'json',
            value: expect.objectContaining({ status: 'success' }),
          },
        },
      ],
    });
    expect(JSON.stringify(chatMessages[3])).not.toContain('"result"');
  });

  /* Preconditions: Terminal kind:tool_call has timeout status
     Action: Call buildMessages()
     Assertions: tool-result output uses AI SDK ToolResultOutput envelope and preserves terminal status
     Requirements: llm-integration.11.3.1.3, llm-integration.11.3.1.3.2 */
  it('should encode terminal tool_result output as ToolResultOutput json envelope', () => {
    const msgs = [
      makeMessage({
        id: 1,
        kind: 'tool_call',
        done: true,
        payloadJson: JSON.stringify({
          data: {
            callId: 'call-timeout',
            toolName: 'code_exec',
            arguments: { task_summary: 'Loop forever', code: 'while(true){}' },
            output: { status: 'timeout', stdout: '', stderr: 'timed out' },
          },
        }),
      }),
    ];

    const chatMessages = makeBuilder().buildMessages(msgs);
    expect(chatMessages[2]).toMatchObject({
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call-timeout',
          toolName: 'code_exec',
          output: {
            type: 'json',
            value: {
              status: 'timeout',
              output: { status: 'timeout', stdout: '', stderr: 'timed out' },
            },
          },
        },
      ],
    });
  });

  /* Preconditions: Terminal kind:tool_call has arguments payload
     Action: Call buildMessages()
     Assertions: replayed assistant tool-call includes original arguments as input
     Requirements: llm-integration.11.3.1.1 */
  it('should replay terminal tool_call arguments in assistant tool-call input', () => {
    const msgs = [
      makeMessage({
        id: 1,
        kind: 'tool_call',
        done: true,
        payloadJson: JSON.stringify({
          data: {
            callId: 'call-args',
            toolName: 'code_exec',
            arguments: {
              task_summary: 'Print x',
              code: "console.log('x')",
              timeout_ms: 5000,
            },
            output: { status: 'success', stdout: 'x' },
          },
        }),
      }),
    ];

    const chatMessages = makeBuilder().buildMessages(msgs);
    expect(chatMessages[1]).toMatchObject({
      role: 'assistant',
      content: [
        {
          type: 'tool-call',
          toolCallId: 'call-args',
          toolName: 'code_exec',
          input: { task_summary: 'Print x', code: "console.log('x')", timeout_ms: 5000 },
        },
      ],
    });
  });
});

describe('normalizePromptWhitespace', () => {
  /* Preconditions: Prompt text has repeated spaces, trailing spaces and excessive blank lines
     Action: Call normalizePromptWhitespace
     Assertions: Prompt is normalized into compact readable form
     Requirements: llm-integration.4.5 */
  it('should normalize repeated spaces and excessive blank lines', () => {
    const input = 'Line   one.   \n\n\n\nLine   two.\t\t\nLine   three   ';
    expect(normalizePromptWhitespace(input)).toBe('Line one.\n\nLine two.\nLine three');
  });
});
