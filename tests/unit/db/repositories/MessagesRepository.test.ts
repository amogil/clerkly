// Requirements: user-data-isolation.6.2, user-data-isolation.7.6
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
    // Setup in-memory database
    sqlite = new Database(':memory:');

    // Create tables
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
        timestamp TEXT NOT NULL,
        payload_json TEXT NOT NULL
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
    /* Preconditions: Agent from another user
       Action: Call listByAgent(agentId)
       Assertions: Throws "Access denied"
       Requirements: user-data-isolation.7.6 */
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

    /* Preconditions: Agent does not exist
       Action: Call create(agentId, payload)
       Assertions: Throws "Access denied"
       Requirements: user-data-isolation.7.6 */
    it('should throw Access denied for non-existent agent', () => {
      expect(() => messagesRepo.create('nonexistent', '{}')).toThrow('Access denied');
    });

    /* Preconditions: Agent from another user
       Action: Call create(agentId, payload)
       Assertions: Throws "Access denied"
       Requirements: user-data-isolation.7.6 */
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

      expect(() => messagesRepo.create('other123', '{"kind":"user"}')).toThrow('Access denied');
    });

    /* Preconditions: Agent from another user
       Action: Call update(messageId, agentId, payload)
       Assertions: Throws "Access denied"
       Requirements: user-data-isolation.7.6 */
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

      expect(() => messagesRepo.update(1, 'other123', '{"kind":"user"}')).toThrow('Access denied');
    });
  });

  describe('create', () => {
    /* Preconditions: Agent for current user
       Action: Call create(agentId, payload)
       Assertions: Message created, agent.updatedAt updated
       Requirements: user-data-isolation.7.6 */
    it('should create message and update agent updatedAt', async () => {
      const agent = agentsRepo.create('Test');
      const beforeUpdate = agentsRepo.findById(agent.agentId)!.updatedAt;

      // Small delay to ensure updatedAt changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      const message = messagesRepo.create(agent.agentId, '{"kind":"user","content":"Hello"}');

      expect(message.agentId).toBe(agent.agentId);
      expect(message.payloadJson).toBe('{"kind":"user","content":"Hello"}');
      expect(message.id).toBeDefined();
      expect(message.timestamp).toBeDefined();

      const afterUpdate = agentsRepo.findById(agent.agentId)!.updatedAt;
      expect(afterUpdate).not.toBe(beforeUpdate);
    });

    /* Preconditions: Agent for current user
       Action: Call create(agentId, payload)
       Assertions: Message has auto-incremented id
       Requirements: user-data-isolation.7.6 */
    it('should auto-increment message id', () => {
      const agent = agentsRepo.create('Test');

      const msg1 = messagesRepo.create(agent.agentId, '{"kind":"user"}');
      const msg2 = messagesRepo.create(agent.agentId, '{"kind":"assistant"}');

      expect(msg2.id).toBe(msg1.id + 1);
    });

    /* Preconditions: Agent for current user
       Action: Call create(agentId, payload)
       Assertions: Message has timestamp set
       Requirements: user-data-isolation.7.6 */
    it('should set timestamp on message creation', () => {
      const agent = agentsRepo.create('Test');
      const before = new Date().toISOString();

      const message = messagesRepo.create(agent.agentId, '{"kind":"user"}');

      const after = new Date().toISOString();
      // ISO strings can be compared lexicographically
      expect(message.timestamp >= before).toBe(true);
      expect(message.timestamp <= after).toBe(true);
    });
  });

  describe('listByAgent', () => {
    /* Preconditions: Agent with messages
       Action: Call listByAgent(agentId)
       Assertions: Returns all messages for agent
       Requirements: user-data-isolation.7.6 */
    it('should list messages for owned agent', () => {
      const agent = agentsRepo.create('Test');
      messagesRepo.create(agent.agentId, '{"kind":"user"}');
      messagesRepo.create(agent.agentId, '{"kind":"assistant"}');
      messagesRepo.create(agent.agentId, '{"kind":"user"}');

      const messages = messagesRepo.listByAgent(agent.agentId);
      expect(messages).toHaveLength(3);
    });

    /* Preconditions: Agent with messages
       Action: Call listByAgent(agentId)
       Assertions: Messages sorted by id ASC
       Requirements: user-data-isolation.7.6 */
    it('should return messages sorted by id ASC', () => {
      const agent = agentsRepo.create('Test');
      const msg1 = messagesRepo.create(agent.agentId, '{"kind":"user"}');
      const msg2 = messagesRepo.create(agent.agentId, '{"kind":"assistant"}');
      const msg3 = messagesRepo.create(agent.agentId, '{"kind":"user"}');

      const messages = messagesRepo.listByAgent(agent.agentId);
      expect(messages[0].id).toBe(msg1.id);
      expect(messages[1].id).toBe(msg2.id);
      expect(messages[2].id).toBe(msg3.id);
    });

    /* Preconditions: Agent without messages
       Action: Call listByAgent(agentId)
       Assertions: Returns empty array
       Requirements: user-data-isolation.7.6 */
    it('should return empty array for agent without messages', () => {
      const agent = agentsRepo.create('Test');
      const messages = messagesRepo.listByAgent(agent.agentId);
      expect(messages).toEqual([]);
    });
  });

  describe('update', () => {
    /* Preconditions: Message exists for owned agent
       Action: Call update(messageId, agentId, newPayload)
       Assertions: Message payload updated
       Requirements: user-data-isolation.7.6 */
    it('should update message payload', () => {
      const agent = agentsRepo.create('Test');
      const message = messagesRepo.create(agent.agentId, '{"kind":"user"}');

      messagesRepo.update(message.id, agent.agentId, '{"kind":"user","content":"Updated"}');

      const messages = messagesRepo.listByAgent(agent.agentId);
      expect(messages[0].payloadJson).toBe('{"kind":"user","content":"Updated"}');
    });

    /* Preconditions: Message exists for owned agent
       Action: Call update with wrong agentId
       Assertions: Message not updated (wrong agent)
       Requirements: user-data-isolation.7.6 */
    it('should not update message with wrong agentId', () => {
      const agent1 = agentsRepo.create('Agent 1');
      const agent2 = agentsRepo.create('Agent 2');
      const message = messagesRepo.create(agent1.agentId, '{"kind":"user"}');

      // Try to update with wrong agentId
      messagesRepo.update(message.id, agent2.agentId, '{"kind":"hacked"}');

      // Original message should be unchanged
      const messages = messagesRepo.listByAgent(agent1.agentId);
      expect(messages[0].payloadJson).toBe('{"kind":"user"}');
    });
  });

  describe('No user logged in', () => {
    /* Preconditions: userId = null
       Action: Call any method
       Assertions: Throws "No user logged in"
       Requirements: user-data-isolation.6.4 */
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
      expect(() => noUserMessagesRepo.create('test', '{}')).toThrow('No user logged in');
      expect(() => noUserMessagesRepo.update(1, 'test', '{}')).toThrow('No user logged in');
    });
  });
});
