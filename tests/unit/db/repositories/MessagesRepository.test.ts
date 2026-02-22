// Requirements: user-data-isolation.6.2, user-data-isolation.7.6, llm-integration.2
// tests/unit/db/repositories/MessagesRepository.test.ts
// Unit tests for MessagesRepository

import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../../../src/main/db/schema';
import { agents } from '../../../../src/main/db/schema';
import { AgentsRepository } from '../../../../src/main/db/repositories/AgentsRepository';
import { MessagesRepository } from '../../../../src/main/db/repositories/MessagesRepository';

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
        timestamp TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        hidden INTEGER NOT NULL DEFAULT 0
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
      expect(() => messagesRepo.create('nonexistent', 'user', '{}')).toThrow('Access denied');
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
      expect(() => messagesRepo.create('other123', 'user', '{}')).toThrow('Access denied');
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
      const msg1 = messagesRepo.create(agent.agentId, 'user', '{}');
      const msg2 = messagesRepo.create(agent.agentId, 'llm', '{}');
      expect(msg2.id).toBe(msg1.id + 1);
      expect(msg1.kind).toBe('user');
      expect(msg2.kind).toBe('llm');
    });

    it('should set timestamp on message creation', () => {
      const agent = agentsRepo.create('Test');
      const before = new Date().toISOString();
      const message = messagesRepo.create(agent.agentId, 'user', '{}');
      const after = new Date().toISOString();
      expect(message.timestamp >= before).toBe(true);
      expect(message.timestamp <= after).toBe(true);
    });

    it('should store error kind correctly', () => {
      const agent = agentsRepo.create('Test');
      const message = messagesRepo.create(
        agent.agentId,
        'error',
        '{"data":{"error":{"message":"fail"}}}'
      );
      expect(message.kind).toBe('error');
    });
  });

  describe('listByAgent', () => {
    it('should list messages for owned agent with kind', () => {
      const agent = agentsRepo.create('Test');
      messagesRepo.create(agent.agentId, 'user', '{}');
      messagesRepo.create(agent.agentId, 'llm', '{}');
      messagesRepo.create(agent.agentId, 'user', '{}');
      const msgs = messagesRepo.listByAgent(agent.agentId);
      expect(msgs).toHaveLength(3);
      expect(msgs[0].kind).toBe('user');
      expect(msgs[1].kind).toBe('llm');
    });

    it('should return messages sorted by id ASC', () => {
      const agent = agentsRepo.create('Test');
      const msg1 = messagesRepo.create(agent.agentId, 'user', '{}');
      const msg2 = messagesRepo.create(agent.agentId, 'llm', '{}');
      const msg3 = messagesRepo.create(agent.agentId, 'user', '{}');
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
      const visible = messagesRepo.create(agent.agentId, 'user', '{}');
      const hidden = messagesRepo.create(agent.agentId, 'llm', '{}');
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
      messagesRepo.create(agent.agentId, 'user', '{}');
      const hidden = messagesRepo.create(agent.agentId, 'llm', '{}');
      messagesRepo.setHidden(hidden.id, agent.agentId);

      const msgs = messagesRepo.listByAgent(agent.agentId, true);
      expect(msgs).toHaveLength(2);
    });
  });

  describe('update', () => {
    it('should update message payload', () => {
      const agent = agentsRepo.create('Test');
      const message = messagesRepo.create(agent.agentId, 'user', '{}');
      messagesRepo.update(message.id, agent.agentId, '{"content":"Updated"}');
      const msgs = messagesRepo.listByAgent(agent.agentId);
      expect(msgs[0].payloadJson).toBe('{"content":"Updated"}');
    });

    it('should not update message with wrong agentId', () => {
      const agent1 = agentsRepo.create('Agent 1');
      const agent2 = agentsRepo.create('Agent 2');
      const message = messagesRepo.create(agent1.agentId, 'user', '{"original":true}');
      messagesRepo.update(message.id, agent2.agentId, '{"hacked":true}');
      const msgs = messagesRepo.listByAgent(agent1.agentId);
      expect(msgs[0].payloadJson).toBe('{"original":true}');
    });
  });

  describe('getLastByAgent', () => {
    it('should return last message by timestamp', async () => {
      const agent = agentsRepo.create('Test');
      messagesRepo.create(agent.agentId, 'user', '{"text":"First"}');
      await new Promise((resolve) => setTimeout(resolve, 10));
      messagesRepo.create(agent.agentId, 'llm', '{"text":"Second"}');
      await new Promise((resolve) => setTimeout(resolve, 10));
      const msg3 = messagesRepo.create(agent.agentId, 'user', '{"text":"Third"}');
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
      const msg = messagesRepo.create(agent.agentId, 'user', '{"text":"Message"}');
      agentsRepo.archive(agent.agentId);
      const lastMessage = messagesRepo.getLastByAgent(agent.agentId);
      expect(lastMessage).not.toBeNull();
      expect(lastMessage!.id).toBe(msg.id);
    });

    it('should return single message when only one exists', () => {
      const agent = agentsRepo.create('Test');
      const msg = messagesRepo.create(agent.agentId, 'user', '{"text":"Only"}');
      const lastMessage = messagesRepo.getLastByAgent(agent.agentId);
      expect(lastMessage).not.toBeNull();
      expect(lastMessage!.id).toBe(msg.id);
      expect(lastMessage!.kind).toBe('user');
    });

    it('should return error message when it is the last message', async () => {
      const agent = agentsRepo.create('Test');
      messagesRepo.create(agent.agentId, 'user', '{"text":"Request"}');
      await new Promise((resolve) => setTimeout(resolve, 10));
      const errorMsg = messagesRepo.create(
        agent.agentId,
        'error',
        '{"data":{"error":{"message":"Something went wrong"}}}'
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
        throw new Error('No user logged in');
      });
      const noUserMessagesRepo = new MessagesRepository(
        db,
        () => {
          throw new Error('No user logged in');
        },
        noUserAgentsRepo
      );
      expect(() => noUserMessagesRepo.listByAgent('test')).toThrow('No user logged in');
      expect(() => noUserMessagesRepo.create('test', 'user', '{}')).toThrow('No user logged in');
      expect(() => noUserMessagesRepo.update(1, 'test', '{}')).toThrow('No user logged in');
    });
  });

  describe('dismissErrorMessages', () => {
    /* Preconditions: Agent with kind:error messages (some visible, some already hidden)
       Action: Call dismissErrorMessages(agentId)
       Assertions: Returns only the records that were actually changed (were visible before),
                   already-hidden errors are not returned, user messages are not touched
       Requirements: llm-integration.3.8 */
    it('should set hidden=true on visible kind:error messages and return only changed records', () => {
      const agent = agentsRepo.create('Test');
      const repo = new MessagesRepository(db, () => 'user1', agentsRepo);

      const errMsg1 = repo.create(
        agent.agentId,
        'error',
        JSON.stringify({ data: { error: { message: 'Fail 1' } } })
      );
      const errMsg2 = repo.create(
        agent.agentId,
        'error',
        JSON.stringify({ data: { error: { message: 'Fail 2' } } })
      );
      const userMsg = repo.create(
        agent.agentId,
        'user',
        JSON.stringify({ data: { text: 'Hello' } })
      );
      // Pre-hide errMsg2 so it should NOT appear in the returned array
      repo.setHidden(errMsg2.id, agent.agentId);

      const changed = repo.dismissErrorMessages(agent.agentId);

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
       Action: Call dismissErrorMessages(agentId)
       Assertions: Returns empty array, no error thrown
       Requirements: llm-integration.3.8 */
    it('should return empty array when no visible error messages exist', () => {
      const agent = agentsRepo.create('Test');
      const repo = new MessagesRepository(db, () => 'user1', agentsRepo);

      repo.create(agent.agentId, 'user', JSON.stringify({ data: { text: 'Hello' } }));

      const changed = repo.dismissErrorMessages(agent.agentId);
      expect(changed).toEqual([]);
    });

    /* Preconditions: Agent with a specific message
       Action: Call setHidden(messageId, agentId)
       Assertions: That message gets hidden=true
       Requirements: llm-integration.8.5 */
    it('should set hidden=true on specific message via setHidden', () => {
      const agent = agentsRepo.create('Test');
      const repo = new MessagesRepository(db, () => 'user1', agentsRepo);

      const msg = repo.create(agent.agentId, 'llm', JSON.stringify({ data: {} }));
      expect(msg.hidden).toBe(false);

      repo.setHidden(msg.id, agent.agentId);

      const updated = repo.getById(msg.id, agent.agentId)!;
      expect(updated.hidden).toBe(true);
    });
  });
});
