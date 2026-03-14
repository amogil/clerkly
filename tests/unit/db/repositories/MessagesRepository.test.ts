// Requirements: user-data-isolation.6.2, user-data-isolation.7.6, llm-integration.2
// tests/unit/db/repositories/MessagesRepository.test.ts
// Unit tests for MessagesRepository

import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../../../src/main/db/schema';
import { agents } from '../../../../src/main/db/schema';
import { AgentsRepository } from '../../../../src/main/db/repositories/AgentsRepository';
import { MessagesRepository } from '../../../../src/main/db/repositories/MessagesRepository';
import { NO_USER_LOGGED_IN_ERROR } from '../../../../src/shared/errors/userErrors';

describe('MessagesRepository', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let agentsRepo: AgentsRepository;
  let messagesRepo: MessagesRepository;
  const testUserId = 'user123';

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        agent_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT
      );
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        run_id TEXT,
        attempt_id INTEGER,
        sequence INTEGER,
        timestamp TEXT NOT NULL,
        reply_to_message_id INTEGER,
        payload_json TEXT NOT NULL,
        usage_json TEXT,
        hidden INTEGER NOT NULL DEFAULT 0,
        done INTEGER NOT NULL DEFAULT 0
      );
    `);
    db = drizzle(sqlite, { schema });
    agentsRepo = new AgentsRepository(db, () => testUserId);
    messagesRepo = new MessagesRepository(db, () => testUserId, agentsRepo);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('Access Control', () => {
    it('should throw Access denied for agents of other users', () => {
      db.insert(agents)
        .values({
          agentId: 'other123',
          userId: 'other_user',
          name: 'Other',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();
      expect(() => messagesRepo.listByAgent('other123')).toThrow('Access denied');
    });

    it('should throw Access denied for non-existent agent', () => {
      expect(() => messagesRepo.create('nonexistent', 'user', '{}', null)).toThrow('Access denied');
    });

    it('should throw Access denied when creating message for other user agent', () => {
      db.insert(agents)
        .values({
          agentId: 'other123',
          userId: 'other_user',
          name: 'Other',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();
      expect(() => messagesRepo.create('other123', 'user', '{}', null)).toThrow('Access denied');
    });

    it('should throw Access denied when updating message for other user agent', () => {
      db.insert(agents)
        .values({
          agentId: 'other123',
          userId: 'other_user',
          name: 'Other',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();
      expect(() => messagesRepo.update(1, 'other123', '{}')).toThrow('Access denied');
    });
  });

  describe('create', () => {
    it('should auto-increment message id and store kind in column', () => {
      const agent = agentsRepo.create('Test');
      const msg1 = messagesRepo.create(agent.agentId, 'user', '{}', null);
      const msg2 = messagesRepo.create(agent.agentId, 'llm', '{}', msg1.id);
      expect(msg2.id).toBe(msg1.id + 1);
      expect(msg1.kind).toBe('user');
      expect(msg2.kind).toBe('llm');
    });

    it('should set timestamp on message creation', () => {
      const agent = agentsRepo.create('Test');
      const before = new Date().toISOString();
      const message = messagesRepo.create(agent.agentId, 'user', '{}', null);
      const after = new Date().toISOString();
      expect(message.timestamp >= before).toBe(true);
      expect(message.timestamp <= after).toBe(true);
    });

    it('should store error kind correctly', () => {
      const agent = agentsRepo.create('Test');
      const message = messagesRepo.create(
        agent.agentId,
        'error',
        '{"data":{"error":{"message":"fail"}}}',
        null
      );
      expect(message.kind).toBe('error');
    });

    it('should persist done flag when explicitly provided', () => {
      const agent = agentsRepo.create('Test');
      const message = messagesRepo.create(agent.agentId, 'user', '{}', null, true);
      expect(message.done).toBe(true);
    });

    /* Preconditions: model-run message with explicit order metadata
       Action: Create message with runId/attemptId/sequence
       Assertions: order metadata persisted in dedicated DB columns
       Requirements: llm-integration.6.7, llm-integration.6.9 */
    it('should persist run order columns on create', () => {
      const agent = agentsRepo.create('Test');
      const message = messagesRepo.create(agent.agentId, 'llm', '{}', null, false, undefined, {
        runId: 'run-1',
        attemptId: 2,
        sequence: 7,
      });

      expect(message.runId).toBe('run-1');
      expect(message.attemptId).toBe(2);
      expect(message.sequence).toBe(7);
    });

    /* Preconditions: Parent user message exists
       Action: Create llm message with replyToMessageId = parent id
       Assertions: reply_to_message_id is persisted and returned
       Requirements: llm-integration.2 */
    it('should persist reply_to_message_id for linked messages', () => {
      const agent = agentsRepo.create('Test');
      const parent = messagesRepo.create(agent.agentId, 'user', '{"data":{"text":"q"}}', null);

      const child = messagesRepo.create(
        agent.agentId,
        'llm',
        '{"data":{"text":"a"}}',
        parent.id,
        false
      );

      expect(child.replyToMessageId).toBe(parent.id);

      const fromDb = messagesRepo.getById(child.id, agent.agentId);
      expect(fromDb?.replyToMessageId).toBe(parent.id);
    });
  });

  describe('listByAgent', () => {
    it('should list messages for owned agent with kind', () => {
      const agent = agentsRepo.create('Test');
      const first = messagesRepo.create(agent.agentId, 'user', '{}', null);
      const second = messagesRepo.create(agent.agentId, 'llm', '{}', first.id);
      messagesRepo.create(agent.agentId, 'user', '{}', second.id);
      const msgs = messagesRepo.listByAgent(agent.agentId);
      expect(msgs).toHaveLength(3);
      expect(msgs[0].kind).toBe('user');
      expect(msgs[1].kind).toBe('llm');
    });

    it('should return messages sorted by id ASC', () => {
      const agent = agentsRepo.create('Test');
      const msg1 = messagesRepo.create(agent.agentId, 'user', '{}', null);
      const msg2 = messagesRepo.create(agent.agentId, 'llm', '{}', msg1.id);
      const msg3 = messagesRepo.create(agent.agentId, 'user', '{}', msg2.id);
      const msgs = messagesRepo.listByAgent(agent.agentId);
      expect(msgs[0].id).toBe(msg1.id);
      expect(msgs[1].id).toBe(msg2.id);
      expect(msgs[2].id).toBe(msg3.id);
    });

    it('should return empty array for agent without messages', () => {
      const agent = agentsRepo.create('Test');
      expect(messagesRepo.listByAgent(agent.agentId)).toEqual([]);
    });

    /* Preconditions: Agent with hidden and visible messages
       Action: Call listByAgent without includeHidden
       Assertions: Hidden messages are excluded from result
       Requirements: llm-integration.3.8, llm-integration.8.5 */
    it('should exclude hidden messages by default', () => {
      const agent = agentsRepo.create('Test');
      const visible = messagesRepo.create(agent.agentId, 'user', '{}', null);
      const hidden = messagesRepo.create(agent.agentId, 'llm', '{}', visible.id);
      messagesRepo.setHidden(hidden.id, agent.agentId);

      const msgs = messagesRepo.listByAgent(agent.agentId);
      expect(msgs).toHaveLength(1);
      expect(msgs[0].id).toBe(visible.id);
    });

    /* Preconditions: Agent with hidden and visible messages
       Action: Call listByAgent with includeHidden=true
       Assertions: All messages including hidden are returned
       Requirements: llm-integration.3.8, llm-integration.8.5 */
    it('should include hidden messages when includeHidden=true', () => {
      const agent = agentsRepo.create('Test');
      const first = messagesRepo.create(agent.agentId, 'user', '{}', null);
      const hidden = messagesRepo.create(agent.agentId, 'llm', '{}', first.id);
      messagesRepo.setHidden(hidden.id, agent.agentId);

      const msgs = messagesRepo.listByAgent(agent.agentId, true);
      expect(msgs).toHaveLength(2);
    });
  });

  describe('update', () => {
    it('should update message payload', () => {
      const agent = agentsRepo.create('Test');
      const message = messagesRepo.create(agent.agentId, 'user', '{}', null);
      messagesRepo.update(message.id, agent.agentId, '{"content":"Updated"}');
      const msgs = messagesRepo.listByAgent(agent.agentId);
      expect(msgs[0].payloadJson).toBe('{"content":"Updated"}');
    });

    it('should not update message with wrong agentId', () => {
      const agent1 = agentsRepo.create('Agent 1');
      const agent2 = agentsRepo.create('Agent 2');
      const message = messagesRepo.create(agent1.agentId, 'user', '{"original":true}', null);
      messagesRepo.update(message.id, agent2.agentId, '{"hacked":true}');
      const msgs = messagesRepo.listByAgent(agent1.agentId);
      expect(msgs[0].payloadJson).toBe('{"original":true}');
    });

    /* Preconditions: Existing llm message without order metadata
       Action: Update message with order columns
       Assertions: run order columns are updated alongside payload
       Requirements: llm-integration.6.9 */
    it('should update run order columns on update', () => {
      const agent = agentsRepo.create('Test');
      const message = messagesRepo.create(agent.agentId, 'llm', '{}', null);

      messagesRepo.update(message.id, agent.agentId, '{"data":{"text":"Updated"}}', false, {
        runId: 'run-2',
        attemptId: 1,
        sequence: 3,
      });

      const updated = messagesRepo.getById(message.id, agent.agentId);
      expect(updated?.runId).toBe('run-2');
      expect(updated?.attemptId).toBe(1);
      expect(updated?.sequence).toBe(3);
    });
  });

  describe('getLastByAgent', () => {
    it('should return last message by timestamp', async () => {
      const agent = agentsRepo.create('Test');
      const first = messagesRepo.create(agent.agentId, 'user', '{"text":"First"}', null);
      await new Promise((resolve) => setTimeout(resolve, 10));
      messagesRepo.create(agent.agentId, 'llm', '{"text":"Second"}', first.id);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const msg3 = messagesRepo.create(agent.agentId, 'user', '{"text":"Third"}', first.id);
      const lastMessage = messagesRepo.getLastByAgent(agent.agentId);
      expect(lastMessage).not.toBeNull();
      expect(lastMessage!.id).toBe(msg3.id);
      expect(lastMessage!.kind).toBe('user');
      expect(lastMessage!.timestamp).toBe(msg3.timestamp);
    });

    it('should return null when no messages exist', () => {
      const agent = agentsRepo.create('Test');
      expect(messagesRepo.getLastByAgent(agent.agentId)).toBeNull();
    });

    it('should throw Access denied for non-existent agent', () => {
      expect(() => messagesRepo.getLastByAgent('nonexistent')).toThrow('Access denied');
    });

    it('should throw Access denied for agents of other users', () => {
      db.insert(agents)
        .values({
          agentId: 'other123',
          userId: 'other_user',
          name: 'Other',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();
      expect(() => messagesRepo.getLastByAgent('other123')).toThrow('Access denied');
    });

    it('should return last message for archived agent', () => {
      const agent = agentsRepo.create('Test');
      const msg = messagesRepo.create(agent.agentId, 'user', '{"text":"Message"}', null);
      agentsRepo.archive(agent.agentId);
      const lastMessage = messagesRepo.getLastByAgent(agent.agentId);
      expect(lastMessage).not.toBeNull();
      expect(lastMessage!.id).toBe(msg.id);
    });

    it('should return single message when only one exists', () => {
      const agent = agentsRepo.create('Test');
      const msg = messagesRepo.create(agent.agentId, 'user', '{"text":"Only"}', null);
      const lastMessage = messagesRepo.getLastByAgent(agent.agentId);
      expect(lastMessage).not.toBeNull();
      expect(lastMessage!.id).toBe(msg.id);
      expect(lastMessage!.kind).toBe('user');
    });

    it('should return error message when it is the last message', async () => {
      const agent = agentsRepo.create('Test');
      const request = messagesRepo.create(agent.agentId, 'user', '{"text":"Request"}', null);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const errorMsg = messagesRepo.create(
        agent.agentId,
        'error',
        '{"data":{"error":{"message":"Something went wrong"}}}',
        request.id
      );
      const lastMessage = messagesRepo.getLastByAgent(agent.agentId);
      expect(lastMessage).not.toBeNull();
      expect(lastMessage!.id).toBe(errorMsg.id);
      expect(lastMessage!.kind).toBe('error');
    });
  });

  describe('No user logged in', () => {
    it('should throw error when no user logged in', () => {
      const noUserAgentsRepo = new AgentsRepository(db, () => {
        throw new Error(NO_USER_LOGGED_IN_ERROR);
      });
      const noUserMessagesRepo = new MessagesRepository(
        db,
        () => {
          throw new Error(NO_USER_LOGGED_IN_ERROR);
        },
        noUserAgentsRepo
      );
      expect(() => noUserMessagesRepo.listByAgent('test')).toThrow(NO_USER_LOGGED_IN_ERROR);
      expect(() => noUserMessagesRepo.create('test', 'user', '{}', null)).toThrow(
        NO_USER_LOGGED_IN_ERROR
      );
      expect(() => noUserMessagesRepo.update(1, 'test', '{}')).toThrow(NO_USER_LOGGED_IN_ERROR);
    });
  });

  describe('hideErrorMessages', () => {
    /* Preconditions: Agent with kind:error messages (some visible, some already hidden)
       Action: Call hideErrorMessages(agentId)
       Assertions: Returns only the records that were actually changed (were visible before),
                   already-hidden errors are not returned, user messages are not touched
       Requirements: llm-integration.3.8 */
    it('should set hidden=true on visible kind:error messages and return only changed records', () => {
      const agent = agentsRepo.create('Test');
      const repo = new MessagesRepository(db, () => 'user1', agentsRepo);

      const errMsg1 = repo.create(
        agent.agentId,
        'error',
        JSON.stringify({ data: { error: { message: 'Fail 1' } } }),
        null
      );
      const errMsg2 = repo.create(
        agent.agentId,
        'error',
        JSON.stringify({ data: { error: { message: 'Fail 2' } } }),
        errMsg1.id
      );
      const userMsg = repo.create(
        agent.agentId,
        'user',
        JSON.stringify({ data: { text: 'Hello' } }),
        errMsg2.id
      );
      // Pre-hide errMsg2 so it should NOT appear in the returned array
      repo.setHidden(errMsg2.id, agent.agentId);

      const changed = repo.hideErrorMessages(agent.agentId);

      // Only errMsg1 was visible — only it should be returned
      expect(changed).toHaveLength(1);
      expect(changed[0].id).toBe(errMsg1.id);
      expect(changed[0].hidden).toBe(true);

      // Verify DB state
      const updated1 = repo.getById(errMsg1.id, agent.agentId)!;
      const updated2 = repo.getById(errMsg2.id, agent.agentId)!;
      const updatedUser = repo.getById(userMsg.id, agent.agentId)!;

      expect(updated1.hidden).toBe(true);
      expect(updated2.hidden).toBe(true);
      expect(updatedUser.hidden).toBe(false);
    });

    /* Preconditions: Agent with no kind:error messages
       Action: Call hideErrorMessages(agentId)
       Assertions: Returns empty array, no error thrown
       Requirements: llm-integration.3.8 */
    it('should return empty array when no visible error messages exist', () => {
      const agent = agentsRepo.create('Test');
      const repo = new MessagesRepository(db, () => 'user1', agentsRepo);

      repo.create(agent.agentId, 'user', JSON.stringify({ data: { text: 'Hello' } }), null);

      const changed = repo.hideErrorMessages(agent.agentId);
      expect(changed).toEqual([]);
    });

    /* Preconditions: Agent with a specific message
       Action: Call setHidden(messageId, agentId)
       Assertions: That message gets hidden=true
       Requirements: llm-integration.8.5 */
    it('should set hidden=true on specific message via setHidden', () => {
      const agent = agentsRepo.create('Test');
      const repo = new MessagesRepository(db, () => 'user1', agentsRepo);

      const msg = repo.create(agent.agentId, 'llm', JSON.stringify({ data: {} }), null);
      expect(msg.hidden).toBe(false);

      repo.setHidden(msg.id, agent.agentId);

      const updated = repo.getById(msg.id, agent.agentId)!;
      expect(updated.hidden).toBe(true);
    });
  });

  describe('setDone', () => {
    it('should update done flag for existing message', () => {
      const agent = agentsRepo.create('Test');
      const message = messagesRepo.create(agent.agentId, 'llm', '{}', null, false);

      messagesRepo.setDone(message.id, agent.agentId, true);

      const updated = messagesRepo.getById(message.id, agent.agentId);
      expect(updated?.done).toBe(true);
    });

    /* Preconditions: Agent has message with done=true
       Action: Call setDone(messageId, agentId, false)
       Assertions: done flag is updated to false
       Requirements: llm-integration.6.5 */
    it('should set done=false for existing message', () => {
      const agent = agentsRepo.create('Test');
      const message = messagesRepo.create(agent.agentId, 'llm', '{}', null, true);

      messagesRepo.setDone(message.id, agent.agentId, false);

      const updated = messagesRepo.getById(message.id, agent.agentId);
      expect(updated?.done).toBe(false);
    });
  });

  describe('updateUsageJson', () => {
    /* Preconditions: Existing llm message for owned agent
       Action: Call updateUsageJson(messageId, agentId, usageJson)
       Assertions: usage_json is persisted for that message
       Requirements: llm-integration.13 */
    it('should persist usage_json for a message', () => {
      const agent = agentsRepo.create('Test');
      const message = messagesRepo.create(agent.agentId, 'llm', '{"data":{}}', null);
      const usageJson = JSON.stringify({
        canonical: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        raw: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      messagesRepo.updateUsageJson(message.id, agent.agentId, usageJson);

      const updated = messagesRepo.getById(message.id, agent.agentId);
      expect(updated?.usageJson).toBe(usageJson);
    });

    /* Preconditions: Existing message with payload and kind
       Action: Update usage_json
       Assertions: payload_json and kind stay unchanged (no duplication in payload)
       Requirements: llm-integration.13 */
    it('should update usage_json without mutating payload_json or kind', () => {
      const agent = agentsRepo.create('Test');
      const payloadJson = '{"data":{"text":"result"}}';
      const message = messagesRepo.create(agent.agentId, 'llm', payloadJson, null);
      const usageJson = JSON.stringify({
        canonical: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
        raw: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
      });

      messagesRepo.updateUsageJson(message.id, agent.agentId, usageJson);

      const updated = messagesRepo.getById(message.id, agent.agentId);
      expect(updated?.usageJson).toBe(usageJson);
      expect(updated?.payloadJson).toBe(payloadJson);
      expect(updated?.kind).toBe('llm');
      expect(JSON.parse(updated?.payloadJson ?? '{}')).not.toHaveProperty('kind');
    });
  });

  describe('listByAgentPaginated', () => {
    let agentId: string;

    beforeEach(() => {
      // Create a test agent
      const agent = agentsRepo.create('Paginated Agent');
      agentId = agent.agentId;
    });

    /* Preconditions: agent with 3 messages
       Action: listByAgentPaginated with limit 50 (no beforeId)
       Assertions: returns all 3 messages in ascending order, hasMore: false
       Requirements: agents.13.1, agents.13.4 */
    it('should return all messages when count <= limit', () => {
      const first = messagesRepo.create(
        agentId,
        'user',
        JSON.stringify({ data: { text: 'a' } }),
        null
      );
      const second = messagesRepo.create(agentId, 'llm', JSON.stringify({ data: {} }), first.id);
      messagesRepo.create(agentId, 'user', JSON.stringify({ data: { text: 'b' } }), second.id);

      const { messages: msgs, hasMore } = messagesRepo.listByAgentPaginated(agentId, 50);
      expect(msgs).toHaveLength(3);
      expect(hasMore).toBe(false);
      // Ascending order (oldest first)
      expect(msgs[0].id).toBeLessThan(msgs[1].id);
    });

    /* Preconditions: agent with 5 messages
       Action: listByAgentPaginated with limit 3
       Assertions: returns last 3 messages, hasMore: true
       Requirements: agents.13.1, agents.13.2 */
    it('should return last N messages and hasMore: true when more exist', () => {
      for (let i = 0; i < 5; i++) {
        messagesRepo.create(agentId, 'user', JSON.stringify({ data: { text: `msg ${i}` } }), null);
      }

      const { messages: msgs, hasMore } = messagesRepo.listByAgentPaginated(agentId, 3);
      expect(msgs).toHaveLength(3);
      expect(hasMore).toBe(true);
    });

    /* Preconditions: agent with 5 messages, beforeId set to 4th message id
       Action: listByAgentPaginated with limit 10, beforeId = id of 4th message
       Assertions: returns first 3 messages (older than beforeId)
       Requirements: agents.13.2 */
    it('should load messages older than beforeId', () => {
      const created: number[] = [];
      for (let i = 0; i < 5; i++) {
        const msg = messagesRepo.create(
          agentId,
          'user',
          JSON.stringify({ data: { text: `msg ${i}` } }),
          null
        );
        created.push(msg.id);
      }

      const beforeId = created[3]; // 4th message
      const { messages: msgs, hasMore } = messagesRepo.listByAgentPaginated(agentId, 10, beforeId);

      // Should return messages with id < beforeId (first 3)
      expect(msgs).toHaveLength(3);
      expect(msgs.every((m) => m.id < beforeId)).toBe(true);
      expect(hasMore).toBe(false);
    });

    /* Preconditions: agent with hidden messages
       Action: listByAgentPaginated
       Assertions: hidden messages are excluded
       Requirements: llm-integration.3.8, llm-integration.8.5 */
    it('should exclude hidden messages', () => {
      const visible = messagesRepo.create(
        agentId,
        'user',
        JSON.stringify({ data: { text: 'visible' } }),
        null
      );
      const hidden = messagesRepo.create(
        agentId,
        'error',
        JSON.stringify({ data: { message: 'err' } }),
        visible.id
      );
      messagesRepo.setHidden(hidden.id, agentId);

      const { messages: msgs } = messagesRepo.listByAgentPaginated(agentId, 50);
      expect(msgs).toHaveLength(1);
      expect(msgs[0].kind).toBe('user');
    });

    /* Preconditions: empty agent
       Action: listByAgentPaginated
       Assertions: returns empty array, hasMore: false
       Requirements: agents.13.4 */
    it('should return empty result for agent with no messages', () => {
      const { messages: msgs, hasMore } = messagesRepo.listByAgentPaginated(agentId, 50);
      expect(msgs).toHaveLength(0);
      expect(hasMore).toBe(false);
    });
  });
});
