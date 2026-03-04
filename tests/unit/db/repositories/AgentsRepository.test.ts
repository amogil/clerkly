// Requirements: user-data-isolation.6.2, user-data-isolation.6.3, user-data-isolation.7.6
// tests/unit/db/repositories/AgentsRepository.test.ts
// Unit tests for AgentsRepository

import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import * as schema from '../../../../src/main/db/schema';
import { agents } from '../../../../src/main/db/schema';
import { AgentsRepository } from '../../../../src/main/db/repositories/AgentsRepository';
import { NO_USER_LOGGED_IN_ERROR } from '../../../../src/shared/errors/userErrors';

describe('AgentsRepository', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let repo: AgentsRepository;
  const testUserId = 'user123';

  beforeEach(() => {
    // Setup in-memory database
    sqlite = new Database(':memory:');

    // Create agents table
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        agent_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT
      )
    `);

    db = drizzle(sqlite, { schema });
    repo = new AgentsRepository(db, () => testUserId);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('list', () => {
    /* Preconditions: Agents from different users in database
       Action: Call list()
       Assertions: Returns only agents for current user
       Requirements: user-data-isolation.6.3 */
    it('should return only agents for current user', () => {
      repo.create('My Agent');

      // Create agent for different user
      db.insert(agents)
        .values({
          agentId: 'other',
          userId: 'other_user',
          name: 'Other',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();

      const result = repo.list();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('My Agent');
    });

    /* Preconditions: Archived agents in database
       Action: Call list()
       Assertions: Archived agents are not returned
       Requirements: user-data-isolation.7.6, agents.5.6 */
    it('should not return archived agents', () => {
      const agent = repo.create('Agent');
      repo.archive(agent.agentId);

      expect(repo.list()).toHaveLength(0);
    });

    /* Preconditions: Mix of archived and non-archived agents
       Action: Call list()
       Assertions: Only non-archived agents returned
       Requirements: agents.5.6 */
    it('should filter out archived agents from mixed list', () => {
      const agent1 = repo.create('Active 1');
      const agent2 = repo.create('Active 2');
      const agent3 = repo.create('To Archive');

      repo.archive(agent3.agentId);

      const result = repo.list();
      expect(result).toHaveLength(2);
      expect(result.map((a) => a.agentId)).toContain(agent1.agentId);
      expect(result.map((a) => a.agentId)).toContain(agent2.agentId);
      expect(result.map((a) => a.agentId)).not.toContain(agent3.agentId);
    });

    /* Preconditions: All agents archived
       Action: Call list()
       Assertions: Returns empty array
       Requirements: agents.5.6 */
    it('should return empty array when all agents are archived', () => {
      const agent1 = repo.create('Agent 1');
      const agent2 = repo.create('Agent 2');

      repo.archive(agent1.agentId);
      repo.archive(agent2.agentId);

      expect(repo.list()).toEqual([]);
    });

    /* Preconditions: Multiple agents
       Action: Call list()
       Assertions: Sorted by updatedAt DESC
       Requirements: user-data-isolation.7.6 */
    it('should return agents sorted by updatedAt DESC', async () => {
      const agent1 = repo.create('First');

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));
      const agent2 = repo.create('Second');

      const result = repo.list();
      // agent2 was created later, so it should be first
      expect(result[0].agentId).toBe(agent2.agentId);
      expect(result[1].agentId).toBe(agent1.agentId);
    });

    /* Preconditions: Empty database
       Action: Call list()
       Assertions: Returns empty array
       Requirements: user-data-isolation.7.6 */
    it('should return empty array when no agents exist', () => {
      expect(repo.list()).toEqual([]);
    });
  });

  describe('create', () => {
    /* Preconditions: Empty database
       Action: Call create('Test Agent')
       Assertions: Agent created with correct userId and 10-character agentId
       Requirements: user-data-isolation.6.3, user-data-isolation.7.6 */
    it('should create agent with current userId and generated agentId', () => {
      const agent = repo.create('Test Agent');

      expect(agent.userId).toBe(testUserId);
      expect(agent.name).toBe('Test Agent');
      expect(agent.agentId).toHaveLength(10);
      expect(agent.agentId).toMatch(/^[A-Za-z0-9]+$/);
    });

    /* Preconditions: Empty database
       Action: Call create() without name
       Assertions: Agent created with name "New Agent"
       Requirements: user-data-isolation.7.6 */
    it('should use default name "New Agent"', () => {
      const agent = repo.create();
      expect(agent.name).toBe('New Agent');
    });

    /* Preconditions: Empty database
       Action: Call create('Test')
       Assertions: createdAt and updatedAt are set
       Requirements: user-data-isolation.7.6 */
    it('should set createdAt and updatedAt timestamps', () => {
      const before = new Date().toISOString();
      const agent = repo.create('Test');
      const after = new Date().toISOString();

      // ISO strings can be compared lexicographically
      expect(agent.createdAt >= before).toBe(true);
      expect(agent.createdAt <= after).toBe(true);
      expect(agent.updatedAt >= before).toBe(true);
      expect(agent.updatedAt <= after).toBe(true);
    });

    /* Preconditions: Empty database
       Action: Call create('Test')
       Assertions: archivedAt is null
       Requirements: user-data-isolation.7.6 */
    it('should create agent with null archivedAt', () => {
      const agent = repo.create('Test');
      expect(agent.archivedAt).toBeNull();
    });
  });

  describe('findById', () => {
    /* Preconditions: Agent exists for current user
       Action: Call findById(agentId)
       Assertions: Returns the agent
       Requirements: user-data-isolation.7.6 */
    it('should find agent by id for current user', () => {
      const created = repo.create('Test');
      const found = repo.findById(created.agentId);

      expect(found).toBeDefined();
      expect(found?.agentId).toBe(created.agentId);
      expect(found?.name).toBe('Test');
    });

    /* Preconditions: Agent from another user
       Action: Call findById(agentId)
       Assertions: Returns undefined (isolation)
       Requirements: user-data-isolation.6.3 */
    it('should not find agents from other users', () => {
      db.insert(agents)
        .values({
          agentId: 'other123',
          userId: 'other_user',
          name: 'Other',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();

      expect(repo.findById('other123')).toBeUndefined();
    });

    /* Preconditions: Agent does not exist
       Action: Call findById('nonexistent')
       Assertions: Returns undefined
       Requirements: user-data-isolation.7.6 */
    it('should return undefined for non-existent agent', () => {
      expect(repo.findById('nonexistent')).toBeUndefined();
    });
  });

  describe('update', () => {
    /* Preconditions: Agent exists
       Action: Call update(agentId, { name: 'New Name' })
       Assertions: Name updated, updatedAt changed
       Requirements: user-data-isolation.7.6 */
    it('should update agent name and updatedAt', async () => {
      const agent = repo.create('Old Name');
      const beforeUpdate = agent.updatedAt;

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));
      repo.update(agent.agentId, { name: 'New Name' });

      const updated = repo.findById(agent.agentId);
      expect(updated).toBeDefined();
      expect(updated!.name).toBe('New Name');
      expect(updated!.updatedAt >= beforeUpdate).toBe(true);
    });

    /* Preconditions: Agent from another user
       Action: Call update(agentId, { name: 'Hacked' })
       Assertions: Data not changed (isolation)
       Requirements: user-data-isolation.6.3 */
    it('should not update agents from other users', () => {
      db.insert(agents)
        .values({
          agentId: 'other123',
          userId: 'other_user',
          name: 'Original',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();

      repo.update('other123', { name: 'Hacked' });

      const agent = db.select().from(agents).where(eq(agents.agentId, 'other123')).get();
      expect(agent?.name).toBe('Original');
    });
  });

  describe('archive', () => {
    /* Preconditions: Agent exists
       Action: Call archive(agentId)
       Assertions: archivedAt is set
       Requirements: user-data-isolation.7.6 */
    it('should set archivedAt timestamp', () => {
      const agent = repo.create('Test');
      expect(agent.archivedAt).toBeNull();

      repo.archive(agent.agentId);

      const archived = repo.findById(agent.agentId);
      expect(archived?.archivedAt).not.toBeNull();
    });

    /* Preconditions: Agent from another user
       Action: Call archive(agentId)
       Assertions: Agent not archived (isolation)
       Requirements: user-data-isolation.6.3 */
    it('should not archive agents from other users', () => {
      db.insert(agents)
        .values({
          agentId: 'other123',
          userId: 'other_user',
          name: 'Other',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();

      repo.archive('other123');

      const agent = db.select().from(agents).where(eq(agents.agentId, 'other123')).get();
      expect(agent?.archivedAt).toBeNull();
    });
  });

  describe('No user logged in', () => {
    /* Preconditions: userId = null
       Action: Call any method
       Assertions: Throws "No user logged in"
       Requirements: user-data-isolation.6.4 */
    it('should throw error when no user logged in', () => {
      const noUserRepo = new AgentsRepository(db, () => {
        throw new Error(NO_USER_LOGGED_IN_ERROR);
      });

      expect(() => noUserRepo.list()).toThrow(NO_USER_LOGGED_IN_ERROR);
      expect(() => noUserRepo.create('Test')).toThrow(NO_USER_LOGGED_IN_ERROR);
      expect(() => noUserRepo.findById('test')).toThrow(NO_USER_LOGGED_IN_ERROR);
      expect(() => noUserRepo.update('test', { name: 'New' })).toThrow(NO_USER_LOGGED_IN_ERROR);
      expect(() => noUserRepo.archive('test')).toThrow(NO_USER_LOGGED_IN_ERROR);
    });
  });
});
