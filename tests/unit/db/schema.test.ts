// Requirements: user-data-isolation.7.4
// tests/unit/db/schema.test.ts
// Unit tests for database schema type definitions

import {
  users,
  userData,
  agents,
  messages,
  User,
  NewUser,
  UserData,
  NewUserData,
  Agent,
  NewAgent,
  Message,
  NewMessage,
} from '../../../src/main/db/schema';

describe('Database Schema', () => {
  describe('Users Table', () => {
    /* Preconditions: Schema is defined
       Action: Check users table structure
       Assertions: All columns are defined with correct types
       Requirements: user-data-isolation.7.3 */
    it('should have correct column definitions', () => {
      expect(users.userId).toBeDefined();
      expect(users.name).toBeDefined();
      expect(users.email).toBeDefined();
      expect(users.googleId).toBeDefined();
      expect(users.locale).toBeDefined();
      expect(users.lastSynced).toBeDefined();
    });

    /* Preconditions: Schema is defined
       Action: Check User type inference
       Assertions: User type has all expected properties
       Requirements: user-data-isolation.7.4 */
    it('should export User type with correct properties', () => {
      const user: User = {
        userId: 'test-id',
        name: 'Test User',
        email: 'test@example.com',
        googleId: 'google-123',
        locale: 'en',
        lastSynced: Date.now(),
      };
      expect(user.userId).toBe('test-id');
      expect(user.email).toBe('test@example.com');
    });

    /* Preconditions: Schema is defined
       Action: Check NewUser type inference
       Assertions: NewUser type allows optional fields
       Requirements: user-data-isolation.7.4 */
    it('should export NewUser type with optional fields', () => {
      const newUser: NewUser = {
        userId: 'test-id',
        email: 'test@example.com',
      };
      expect(newUser.userId).toBe('test-id');
      expect(newUser.name).toBeUndefined();
    });
  });

  describe('UserData Table', () => {
    /* Preconditions: Schema is defined
       Action: Check user_data table structure
       Assertions: All columns are defined with correct types
       Requirements: user-data-isolation.7.3 */
    it('should have correct column definitions', () => {
      expect(userData.key).toBeDefined();
      expect(userData.userId).toBeDefined();
      expect(userData.value).toBeDefined();
      expect(userData.createdAt).toBeDefined();
      expect(userData.updatedAt).toBeDefined();
    });

    /* Preconditions: Schema is defined
       Action: Check UserData type inference
       Assertions: UserData type has all expected properties
       Requirements: user-data-isolation.7.4 */
    it('should export UserData type with correct properties', () => {
      const data: UserData = {
        key: 'test-key',
        userId: 'user-123',
        value: '{"test": true}',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      expect(data.key).toBe('test-key');
      expect(data.userId).toBe('user-123');
    });

    /* Preconditions: Schema is defined
       Action: Check NewUserData type inference
       Assertions: NewUserData type requires all fields
       Requirements: user-data-isolation.7.4 */
    it('should export NewUserData type requiring all fields', () => {
      const newData: NewUserData = {
        key: 'test-key',
        userId: 'user-123',
        value: 'test-value',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      expect(newData.key).toBe('test-key');
    });
  });

  describe('Agents Table', () => {
    /* Preconditions: Schema is defined
       Action: Check agents table structure
       Assertions: All columns are defined with correct types
       Requirements: user-data-isolation.7.3 */
    it('should have correct column definitions', () => {
      expect(agents.agentId).toBeDefined();
      expect(agents.userId).toBeDefined();
      expect(agents.name).toBeDefined();
      expect(agents.createdAt).toBeDefined();
      expect(agents.updatedAt).toBeDefined();
      expect(agents.archivedAt).toBeDefined();
    });

    /* Preconditions: Schema is defined
       Action: Check Agent type inference
       Assertions: Agent type has all expected properties
       Requirements: user-data-isolation.7.4 */
    it('should export Agent type with correct properties', () => {
      const agent: Agent = {
        agentId: 'agent-123',
        userId: 'user-123',
        name: 'Test Agent',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        archivedAt: null,
      };
      expect(agent.agentId).toBe('agent-123');
      expect(agent.archivedAt).toBeNull();
    });

    /* Preconditions: Schema is defined
       Action: Check NewAgent type inference
       Assertions: NewAgent type allows optional archivedAt
       Requirements: user-data-isolation.7.4 */
    it('should export NewAgent type with optional archivedAt', () => {
      const newAgent: NewAgent = {
        agentId: 'agent-123',
        userId: 'user-123',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      expect(newAgent.agentId).toBe('agent-123');
      expect(newAgent.archivedAt).toBeUndefined();
    });
  });

  describe('Messages Table', () => {
    /* Preconditions: Schema is defined
       Action: Check messages table structure
       Assertions: All columns are defined with correct types
       Requirements: user-data-isolation.7.3, llm-integration.2 */
    it('should have correct column definitions', () => {
      expect(messages.id).toBeDefined();
      expect(messages.agentId).toBeDefined();
      expect(messages.kind).toBeDefined();
      expect(messages.timestamp).toBeDefined();
      expect(messages.payloadJson).toBeDefined();
    });

    /* Preconditions: Schema is defined
       Action: Check Message type inference
       Assertions: Message type has all expected properties
       Requirements: user-data-isolation.7.4, llm-integration.2 */
    it('should export Message type with correct properties', () => {
      const message: Message = {
        id: 1,
        agentId: 'agent-123',
        kind: 'user',
        timestamp: new Date().toISOString(),
        payloadJson: '{"content": "Hello"}',
      };
      expect(message.id).toBe(1);
      expect(message.agentId).toBe('agent-123');
      expect(message.kind).toBe('user');
    });

    /* Preconditions: Schema is defined
       Action: Check NewMessage type inference
       Assertions: NewMessage type allows optional id (auto-increment)
       Requirements: user-data-isolation.7.4, llm-integration.2 */
    it('should export NewMessage type with optional id', () => {
      const newMessage: NewMessage = {
        agentId: 'agent-123',
        kind: 'user',
        timestamp: new Date().toISOString(),
        payloadJson: '{}',
      };
      expect(newMessage.agentId).toBe('agent-123');
      expect(newMessage.kind).toBe('user');
      expect(newMessage.id).toBeUndefined();
    });
  });
});
