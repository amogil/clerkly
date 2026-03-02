// Requirements: llm-integration.1
// tests/unit/media/ImageStorageManager.test.ts

import { ImageStorageManager } from '../../../src/main/media/ImageStorageManager';

describe('ImageStorageManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = undefined;
  });

  /* Preconditions: Invalid URL provided
     Action: downloadAndStore() is called
     Assertions: Status set to error
     Requirements: llm-integration.1, llm-integration.9.8 */
  it('should mark error for invalid url', async () => {
    const dbManager = {
      images: {
        upsert: jest.fn(),
        get: jest.fn(),
      },
    };
    const manager = new ImageStorageManager(dbManager as any);

    await manager.downloadAndStore('agent-1', '1', 1, 'ftp://bad-url');

    expect(dbManager.images.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' })
    );
    expect(dbManager.images.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error' })
    );
  });

  /* Preconditions: Valid image response
     Action: downloadAndStore() is called
     Assertions: Status set to success with bytes
     Requirements: llm-integration.1, llm-integration.9.8 */
  it('should store image on success', async () => {
    const dbManager = {
      images: {
        upsert: jest.fn(),
        get: jest.fn(),
      },
    };
    const manager = new ImageStorageManager(dbManager as any);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });

    await manager.downloadAndStore('agent-1', '1', 1, 'https://example.com/a.png');

    expect(dbManager.images.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'success', contentType: 'image/png' })
    );
  });

  /* Preconditions: Stored image record exists
     Action: getImage() is called
     Assertions: Returns success with bytes
     Requirements: llm-integration.1, llm-integration.9.8 */
  it('should return success for stored image', () => {
    const dbManager = {
      images: {
        upsert: jest.fn(),
        get: jest.fn().mockReturnValue({
          status: 'success',
          bytes: Buffer.from([1, 2]),
          contentType: 'image/png',
          size: 2,
        }),
      },
    };
    const manager = new ImageStorageManager(dbManager as any);

    const result = manager.getImage('agent-1', '1', 1);
    expect(result).toEqual({
      found: true,
      status: 'success',
      bytes: Buffer.from([1, 2]),
      contentType: 'image/png',
      size: 2,
    });
  });
});
