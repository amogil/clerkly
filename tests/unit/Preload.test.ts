// Requirements: clerkly.2.1, clerkly.2.8

/**
 * Unit tests for Preload Script
 * Tests secure IPC API exposure via contextBridge
 */

import { contextBridge, ipcRenderer } from 'electron';

// Mock electron modules
jest.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: jest.fn(),
  },
  ipcRenderer: {
    invoke: jest.fn(),
  },
}));

describe('Preload Script', () => {
  let exposedAPI: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Capture the API object exposed via contextBridge
    (contextBridge.exposeInMainWorld as jest.Mock).mockImplementation(
      (apiName: string, api: any) => {
        if (apiName === 'api') {
          exposedAPI = api;
        }
      }
    );

    // Re-import preload to trigger contextBridge.exposeInMainWorld
    jest.isolateModules(() => {
      require('../../src/preload/index');
    });
  });

  /* Preconditions: contextBridge is available, preload script is loaded
     Action: load preload script
     Assertions: contextBridge.exposeInMainWorld is called with 'api' and API object
     Requirements: clerkly.1.4, clerkly.2.5 */
  it('should expose API via contextBridge', () => {
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith('api', expect.any(Object));
    expect(exposedAPI).toBeDefined();
    expect(exposedAPI).toHaveProperty('saveData');
    expect(exposedAPI).toHaveProperty('loadData');
    expect(exposedAPI).toHaveProperty('deleteData');
  });

  /* Preconditions: API is exposed via contextBridge, ipcRenderer.invoke is mocked
     Action: call exposedAPI.saveData with key and value
     Assertions: ipcRenderer.invoke is called with 'save-data', key, value
     Requirements: clerkly.1.4, clerkly.2.5 */
  it('should call ipcRenderer.invoke for saveData', async () => {
    const mockResponse = { success: true };
    (ipcRenderer.invoke as jest.Mock).mockResolvedValue(mockResponse);

    const result = await exposedAPI.saveData('test-key', { data: 'test-value' });

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('save-data', 'test-key', {
      data: 'test-value',
    });
    expect(result).toEqual(mockResponse);
  });

  /* Preconditions: API is exposed via contextBridge, ipcRenderer.invoke is mocked
     Action: call exposedAPI.loadData with key
     Assertions: ipcRenderer.invoke is called with 'load-data', key
     Requirements: clerkly.1.4, clerkly.2.5 */
  it('should call ipcRenderer.invoke for loadData', async () => {
    const mockResponse = { success: true, data: { data: 'test-value' } };
    (ipcRenderer.invoke as jest.Mock).mockResolvedValue(mockResponse);

    const result = await exposedAPI.loadData('test-key');

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('load-data', 'test-key');
    expect(result).toEqual(mockResponse);
  });

  /* Preconditions: API is exposed via contextBridge, ipcRenderer.invoke is mocked
     Action: call exposedAPI.deleteData with key
     Assertions: ipcRenderer.invoke is called with 'delete-data', key
     Requirements: clerkly.1.4, clerkly.2.5 */
  it('should call ipcRenderer.invoke for deleteData', async () => {
    const mockResponse = { success: true };
    (ipcRenderer.invoke as jest.Mock).mockResolvedValue(mockResponse);

    const result = await exposedAPI.deleteData('test-key');

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('delete-data', 'test-key');
    expect(result).toEqual(mockResponse);
  });

  /* Preconditions: API is exposed via contextBridge, ipcRenderer.invoke returns error
     Action: call exposedAPI.saveData with invalid parameters
     Assertions: error response is returned from ipcRenderer.invoke
     Requirements: clerkly.1.4, clerkly.2.5 */
  it('should handle saveData errors from IPC', async () => {
    const mockError = { success: false, error: 'Invalid key' };
    (ipcRenderer.invoke as jest.Mock).mockResolvedValue(mockError);

    const result = await exposedAPI.saveData('', 'value');

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('save-data', '', 'value');
    expect(result).toEqual(mockError);
  });

  /* Preconditions: API is exposed via contextBridge, ipcRenderer.invoke returns error
     Action: call exposedAPI.loadData with non-existent key
     Assertions: error response is returned from ipcRenderer.invoke
     Requirements: clerkly.1.4, clerkly.2.5 */
  it('should handle loadData errors from IPC', async () => {
    const mockError = { success: false, error: 'Key not found' };
    (ipcRenderer.invoke as jest.Mock).mockResolvedValue(mockError);

    const result = await exposedAPI.loadData('non-existent-key');

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('load-data', 'non-existent-key');
    expect(result).toEqual(mockError);
  });

  /* Preconditions: API is exposed via contextBridge, ipcRenderer.invoke returns error
     Action: call exposedAPI.deleteData with non-existent key
     Assertions: error response is returned from ipcRenderer.invoke
     Requirements: clerkly.1.4, clerkly.2.5 */
  it('should handle deleteData errors from IPC', async () => {
    const mockError = { success: false, error: 'Key not found' };
    (ipcRenderer.invoke as jest.Mock).mockResolvedValue(mockError);

    const result = await exposedAPI.deleteData('non-existent-key');

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('delete-data', 'non-existent-key');
    expect(result).toEqual(mockError);
  });

  /* Preconditions: API is exposed via contextBridge, ipcRenderer.invoke is mocked
     Action: call all API methods with various data types
     Assertions: all methods work correctly with different data types
     Requirements: clerkly.1.4, clerkly.2.5 */
  it('should handle various data types in saveData', async () => {
    const testCases = [
      { key: 'string-key', value: 'string-value' },
      { key: 'number-key', value: 42 },
      { key: 'boolean-key', value: true },
      { key: 'object-key', value: { nested: { data: 'value' } } },
      { key: 'array-key', value: [1, 2, 3, 'four'] },
      { key: 'null-key', value: null },
    ];

    for (const testCase of testCases) {
      (ipcRenderer.invoke as jest.Mock).mockResolvedValue({ success: true });

      await exposedAPI.saveData(testCase.key, testCase.value);

      expect(ipcRenderer.invoke).toHaveBeenCalledWith('save-data', testCase.key, testCase.value);
    }
  });
});
