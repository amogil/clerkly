// Requirements: llm-integration.1
// tests/unit/media/ImageStorageManager.test.ts

import { ImageStorageManager } from '../../../src/main/media/ImageStorageManager';
import { ipcMain } from 'electron';

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
  },
}));

interface ImagesRepoMock {
  upsert: jest.Mock;
  get: jest.Mock;
}

function createManager(imagesRepo?: Partial<ImagesRepoMock>): {
  manager: ImageStorageManager;
  images: ImagesRepoMock;
} {
  const images: ImagesRepoMock = {
    upsert: jest.fn(),
    get: jest.fn(),
    ...imagesRepo,
  };
  const dbManager = { images } as unknown as ConstructorParameters<typeof ImageStorageManager>[0];
  return { manager: new ImageStorageManager(dbManager), images };
}

describe('ImageStorageManager', () => {
  const mockedIpcMain = ipcMain as unknown as { handle: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = undefined as unknown as typeof fetch;
  });

  /* Preconditions: Invalid URL provided
     Action: downloadAndStore() is called
     Assertions: Status set to error
     Requirements: llm-integration.1, llm-integration.9.8 */
  it('should mark error for invalid url', async () => {
    const { manager, images } = createManager();

    await manager.downloadAndStore('agent-1', '1', 1, 'ftp://bad-url');

    expect(images.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    expect(images.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
  });

  /* Preconditions: URL exceeds max supported length
     Action: downloadAndStore() is called
     Assertions: Status set to error without fetch call
     Requirements: llm-integration.1, llm-integration.9.8 */
  it('should mark error for too long url', async () => {
    const { manager, images } = createManager();
    const longUrl = `https://example.com/${'a'.repeat(3000)}`;
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    await manager.downloadAndStore('agent-1', '1', 2, longUrl);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(images.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
  });

  /* Preconditions: Valid image response
     Action: downloadAndStore() is called
     Assertions: Status set to success with bytes
     Requirements: llm-integration.1, llm-integration.9.8 */
  it('should store image on success', async () => {
    const { manager, images } = createManager();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/png; charset=utf-8' },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }) as unknown as typeof fetch;

    await manager.downloadAndStore('agent-1', '1', 1, 'https://example.com/a.png');

    expect(images.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'success', contentType: 'image/png' })
    );
  });

  /* Preconditions: HTTP request returns non-2xx status
     Action: downloadAndStore() is called
     Assertions: Status set to error
     Requirements: llm-integration.1, llm-integration.9.8 */
  it('should mark error when response is not ok', async () => {
    const { manager, images } = createManager();
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => null },
    }) as unknown as typeof fetch;

    await manager.downloadAndStore('agent-1', '1', 3, 'https://example.com/fail.png');

    expect(images.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
  });

  /* Preconditions: HTTP response has no content type
     Action: downloadAndStore() is called
     Assertions: Status set to error
     Requirements: llm-integration.1, llm-integration.9.8 */
  it('should mark error when content-type is missing', async () => {
    const { manager, images } = createManager();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    }) as unknown as typeof fetch;

    await manager.downloadAndStore('agent-1', '1', 4, 'https://example.com/no-content-type.png');

    expect(images.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
  });

  /* Preconditions: HTTP response has unsupported content type
     Action: downloadAndStore() is called
     Assertions: Status set to error
     Requirements: llm-integration.1, llm-integration.9.8 */
  it('should mark error for unsupported content type', async () => {
    const { manager, images } = createManager();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'text/plain' },
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    }) as unknown as typeof fetch;

    await manager.downloadAndStore('agent-1', '1', 5, 'https://example.com/not-image.txt');

    expect(images.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
  });

  /* Preconditions: HTTP response body is empty
     Action: downloadAndStore() is called
     Assertions: Status set to error
     Requirements: llm-integration.1, llm-integration.9.8 */
  it('should mark error for empty response body', async () => {
    const { manager, images } = createManager();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => new Uint8Array([]).buffer,
    }) as unknown as typeof fetch;

    await manager.downloadAndStore('agent-1', '1', 6, 'https://example.com/empty.png');

    expect(images.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
  });

  /* Preconditions: Network error during fetch
     Action: downloadAndStore() is called
     Assertions: Status set to error from catch branch
     Requirements: llm-integration.1, llm-integration.9.8 */
  it('should mark error when fetch throws', async () => {
    const { manager, images } = createManager();
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

    await manager.downloadAndStore('agent-1', '1', 7, 'https://example.com/network.png');

    expect(images.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
  });

  /* Preconditions: Missing descriptor for placeholder id
     Action: markMissingDescriptor() is called
     Assertions: Error image record is upserted
     Requirements: llm-integration.1, llm-integration.9.4, llm-integration.9.8 */
  it('should upsert missing descriptor as error', () => {
    const { manager, images } = createManager();

    manager.markMissingDescriptor('agent-1', '1', 42);

    expect(images.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-1',
        messageId: '1',
        imageId: 42,
        url: 'missing',
        status: 'error',
      })
    );
  });

  /* Preconditions: Stored image record exists
     Action: getImage() is called
     Assertions: Returns success with bytes
     Requirements: llm-integration.1, llm-integration.9.8 */
  it('should return success for stored image', () => {
    const { manager } = createManager({
      get: jest.fn().mockReturnValue({
        status: 'success',
        bytes: Buffer.from([1, 2]),
        contentType: 'image/png',
        size: 2,
      }),
    });

    const result = manager.getImage('agent-1', '1', 1);
    expect(result).toEqual({
      found: true,
      status: 'success',
      bytes: Buffer.from([1, 2]),
      contentType: 'image/png',
      size: 2,
    });
  });

  /* Preconditions: Image record does not exist
     Action: getImage() is called
     Assertions: Returns found=false and error status
     Requirements: llm-integration.1, llm-integration.9.8 */
  it('should return error status when image record is missing', () => {
    const { manager } = createManager({
      get: jest.fn().mockReturnValue(null),
    });

    expect(manager.getImage('agent-1', '1', 10)).toEqual({ found: false, status: 'error' });
  });

  /* Preconditions: Image record is in pending state
     Action: getImage() is called
     Assertions: Returns pending status
     Requirements: llm-integration.1, llm-integration.9.8 */
  it('should return pending status for pending record', () => {
    const { manager } = createManager({
      get: jest.fn().mockReturnValue({ status: 'pending' }),
    });

    expect(manager.getImage('agent-1', '1', 11)).toEqual({ found: true, status: 'pending' });
  });

  /* Preconditions: Image record is in error state
     Action: getImage() is called
     Assertions: Returns error status
     Requirements: llm-integration.1, llm-integration.9.8 */
  it('should return error status for error record', () => {
    const { manager } = createManager({
      get: jest.fn().mockReturnValue({ status: 'error' }),
    });

    expect(manager.getImage('agent-1', '1', 12)).toEqual({ found: true, status: 'error' });
  });

  /* Preconditions: Manager is initialized
     Action: registerHandlers() is called and handler is invoked
     Assertions: IPC handler is registered and delegates to getImage
     Requirements: llm-integration.1 */
  it('should register images:get IPC handler and delegate to getImage', async () => {
    const { manager, images } = createManager({
      get: jest.fn().mockReturnValue({ status: 'pending' }),
    });
    manager.registerHandlers();

    expect(mockedIpcMain.handle).toHaveBeenCalledWith('images:get', expect.any(Function));
    const handler = mockedIpcMain.handle.mock.calls[0][1] as (
      _event: unknown,
      args: { agentId: string; messageId: string; imageId: number }
    ) => Promise<unknown>;

    const result = await handler({}, { agentId: 'agent-1', messageId: '1', imageId: 13 });
    expect(result).toEqual({ found: true, status: 'pending' });
    expect(images.get).toHaveBeenCalledWith('agent-1', '1', 13);
  });
});
