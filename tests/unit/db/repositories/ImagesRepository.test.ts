// Requirements: llm-integration.1, llm-integration.9.6, user-data-isolation.7.6
// tests/unit/db/repositories/ImagesRepository.test.ts

import { AgentsRepository } from '../../../../src/main/db/repositories/AgentsRepository';
import { ImagesRepository } from '../../../../src/main/db/repositories/ImagesRepository';
import type { Image, NewImage } from '../../../../src/main/db/schema';

interface MockDb {
  select: jest.Mock;
  insert: jest.Mock;
}

interface MockSelectChain {
  from: jest.Mock;
  where: jest.Mock;
  limit: jest.Mock;
  all: jest.Mock;
}

interface MockInsertChain {
  values: jest.Mock;
  onConflictDoUpdate: jest.Mock;
  returning: jest.Mock;
  get: jest.Mock;
}

describe('ImagesRepository', () => {
  let db: MockDb;
  let selectChain: MockSelectChain;
  let insertChain: MockInsertChain;
  let agentsRepo: Pick<AgentsRepository, 'findById'>;
  let imagesRepo: ImagesRepository;

  function createAgent(agentId: string): { agentId: string; userId: string } {
    return { agentId, userId: 'user-1' };
  }

  beforeEach(() => {
    selectChain = {
      from: jest.fn(),
      where: jest.fn(),
      limit: jest.fn(),
      all: jest.fn(),
    };
    selectChain.from.mockReturnValue(selectChain);
    selectChain.where.mockReturnValue(selectChain);
    selectChain.limit.mockReturnValue(selectChain);
    selectChain.all.mockReturnValue([]);

    insertChain = {
      values: jest.fn(),
      onConflictDoUpdate: jest.fn(),
      returning: jest.fn(),
      get: jest.fn(),
    };
    insertChain.values.mockReturnValue(insertChain);
    insertChain.onConflictDoUpdate.mockReturnValue(insertChain);
    insertChain.returning.mockReturnValue(insertChain);
    insertChain.get.mockReturnValue({
      agentId: 'agent-1',
      messageId: '11',
      imageId: 2,
      url: 'https://example.com/a.png',
      status: 'pending',
      hash: null,
      contentType: null,
      size: null,
      bytes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Image);

    db = {
      select: jest.fn().mockReturnValue(selectChain),
      insert: jest.fn().mockReturnValue(insertChain),
    };

    agentsRepo = {
      findById: jest.fn().mockReturnValue(createAgent('agent-1')),
    };

    imagesRepo = new ImagesRepository(
      db as unknown as ConstructorParameters<typeof ImagesRepository>[0],
      agentsRepo as unknown as AgentsRepository
    );
  });

  /* Preconditions: Image request references non-existent agent
     Action: Call get() with unknown agent id
     Assertions: Throws access denied
     Requirements: user-data-isolation.7.6 */
  it('should deny access when agent does not exist', () => {
    (agentsRepo.findById as jest.Mock).mockReturnValue(undefined);
    expect(() => imagesRepo.get('unknown-agent', '1', 1)).toThrow('Access denied');
  });

  /* Preconditions: Agent exists and has no matching image record
     Action: Call get() for missing image
     Assertions: Returns null
     Requirements: llm-integration.1, llm-integration.9.6 */
  it('should return null when image is not found', () => {
    (agentsRepo.findById as jest.Mock).mockReturnValue(createAgent('agent-1'));
    selectChain.all.mockReturnValue([]);
    const record = imagesRepo.get('agent-1', '10', 1);
    expect(record).toBeNull();
  });

  /* Preconditions: Agent exists and image record is upserted
     Action: Call get() with matching keys
     Assertions: Returns stored image record
     Requirements: llm-integration.1, llm-integration.9.6 */
  it('should return image record after upsert', () => {
    (agentsRepo.findById as jest.Mock).mockReturnValue(createAgent('agent-1'));
    const row: Image = {
      agentId: 'agent-1',
      messageId: '11',
      imageId: 2,
      url: 'https://example.com/a.png',
      status: 'pending',
      hash: null,
      contentType: null,
      size: null,
      bytes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    selectChain.all.mockReturnValue([row]);
    const record = imagesRepo.get('agent-1', '11', 2);
    expect(record).toEqual(row);
  });

  /* Preconditions: Existing image row for same (agent,message,image)
     Action: Call upsert() with updated payload
     Assertions: Existing row is updated and metadata preserved
     Requirements: llm-integration.1, llm-integration.9.6 */
  it('should update existing record on conflict', () => {
    (agentsRepo.findById as jest.Mock).mockReturnValue(createAgent('agent-1'));
    imagesRepo.upsert({
      agentId: 'agent-1',
      messageId: '12',
      imageId: 3,
      url: 'https://example.com/pending.png',
      status: 'pending',
    });

    const bytes = Buffer.from([1, 2, 3]);
    const updatedRow: Image = {
      agentId: 'agent-1',
      messageId: '12',
      imageId: 3,
      url: 'https://example.com/success.png',
      status: 'success',
      hash: 'abc123',
      contentType: 'image/png',
      size: bytes.length,
      bytes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    insertChain.get.mockReturnValue(updatedRow);

    const updated = imagesRepo.upsert({
      agentId: 'agent-1',
      messageId: '12',
      imageId: 3,
      url: 'https://example.com/success.png',
      status: 'success',
      hash: 'abc123',
      contentType: 'image/png',
      size: bytes.length,
      bytes,
    });

    expect(updated.status).toBe('success');
    expect(updated.url).toBe('https://example.com/success.png');
    expect(updated.hash).toBe('abc123');
    expect(updated.contentType).toBe('image/png');
    expect(updated.size).toBe(3);
    expect(insertChain.values).toHaveBeenCalled();
    const firstValues = insertChain.values.mock.calls[0][0] as NewImage;
    expect(firstValues.agentId).toBe('agent-1');
    expect(firstValues.status).toBe('pending');
    expect(insertChain.onConflictDoUpdate).toHaveBeenCalled();
  });

  /* Preconditions: Agent belongs to another user
     Action: Call upsert() for foreign agent id
     Assertions: Throws access denied
     Requirements: user-data-isolation.7.6 */
  it('should deny upsert for agent from another user', () => {
    (agentsRepo.findById as jest.Mock).mockReturnValue(undefined);

    expect(() =>
      imagesRepo.upsert({
        agentId: 'foreign-agent',
        messageId: '13',
        imageId: 4,
        url: 'https://example.com/x.png',
        status: 'pending',
      })
    ).toThrow('Access denied');
  });
});
