// Requirements: clerkly.2.1, clerkly.2.3, clerkly.2.4
const IPCHandlers = require('../../src/main/IPCHandlers');
const IPCClient = require('../../src/renderer/IPCClient');
const { ipcMain, ipcRenderer, resetAllMocks } = require('../mocks/electron');

/**
 * Unit tests for IPC communication
 * Tests handlers in Main Process and client in Renderer Process
 * 
 * Requirements: clerkly.2.1, clerkly.2.3, clerkly.2.4
 */
describe('IPC Communication', () => {
  let mockDataManager;
  let ipcHandlers;
  let ipcClient;

  beforeEach(() => {
    // Reset all mocks
    resetAllMocks();

    // Create mock DataManager
    mockDataManager = {
      saveData: jest.fn(),
      loadData: jest.fn(),
      deleteData: jest.fn()
    };

    // Create IPCHandlers instance
    ipcHandlers = new IPCHandlers(mockDataManager);
    ipcHandlers.registerHandlers();

    // Create IPCClient instance
    ipcClient = new IPCClient(10000);
  });

  afterEach(() => {
    // Unregister handlers
    if (ipcHandlers) {
      ipcHandlers.unregisterHandlers();
    }
  });

  describe('IPCHandlers - Main Process', () => {
    /* Preconditions: IPCHandlers instance created with mock DataManager
       Action: call constructor with null DataManager
       Assertions: throws error about required DataManager
       Requirements: clerkly.1.4 */
    it('should throw error if DataManager is not provided', () => {
      expect(() => new IPCHandlers(null)).toThrow('DataManager is required');
    });

    /* Preconditions: IPCHandlers instance created and handlers registered
       Action: call registerHandlers()
       Assertions: handlers are registered for save-data, load-data, delete-data channels
       Requirements: clerkly.1.4 */
    it('should register all IPC handlers', () => {
      expect(ipcMain.handlers['save-data']).toBeDefined();
      expect(ipcMain.handlers['load-data']).toBeDefined();
      expect(ipcMain.handlers['delete-data']).toBeDefined();
    });

    /* Preconditions: IPCHandlers instance with registered handlers
       Action: call unregisterHandlers()
       Assertions: all handlers are removed from ipcMain
       Requirements: clerkly.1.4 */
    it('should unregister all IPC handlers', () => {
      ipcHandlers.unregisterHandlers();
      expect(ipcMain.handlers['save-data']).toBeUndefined();
      expect(ipcMain.handlers['load-data']).toBeUndefined();
      expect(ipcMain.handlers['delete-data']).toBeUndefined();
    });

    describe('save-data handler', () => {
      /* Preconditions: DataManager.saveData returns success
         Action: call handleSaveData with valid key and value
         Assertions: returns success true, DataManager.saveData called with correct params
         Requirements: clerkly.1.4 */
      it('should handle valid save-data request', async () => {
        mockDataManager.saveData.mockReturnValue({ success: true });

        const result = await ipcHandlers.handleSaveData({}, 'test-key', 'test-value');

        expect(result.success).toBe(true);
        expect(mockDataManager.saveData).toHaveBeenCalledWith('test-key', 'test-value');
      });

      /* Preconditions: IPCHandlers instance ready
         Action: call handleSaveData with null key
         Assertions: returns success false with error about required key
         Requirements: clerkly.1.4, clerkly.2.3 */
      it('should reject save-data with null key', async () => {
        const result = await ipcHandlers.handleSaveData({}, null, 'value');

        expect(result.success).toBe(false);
        expect(result.error).toContain('key is required');
        expect(mockDataManager.saveData).not.toHaveBeenCalled();
      });

      /* Preconditions: IPCHandlers instance ready
         Action: call handleSaveData with undefined key
         Assertions: returns success false with error about required key
         Requirements: clerkly.1.4, clerkly.2.3 */
      it('should reject save-data with undefined key', async () => {
        const result = await ipcHandlers.handleSaveData({}, undefined, 'value');

        expect(result.success).toBe(false);
        expect(result.error).toContain('key is required');
        expect(mockDataManager.saveData).not.toHaveBeenCalled();
      });

      /* Preconditions: IPCHandlers instance ready
         Action: call handleSaveData with undefined value
         Assertions: returns success false with error about required value
         Requirements: clerkly.1.4, clerkly.2.3 */
      it('should reject save-data with undefined value', async () => {
        const result = await ipcHandlers.handleSaveData({}, 'key', undefined);

        expect(result.success).toBe(false);
        expect(result.error).toContain('value is required');
        expect(mockDataManager.saveData).not.toHaveBeenCalled();
      });

      /* Preconditions: DataManager.saveData returns error
         Action: call handleSaveData with valid parameters
         Assertions: returns success false with error message from DataManager
         Requirements: clerkly.1.4, clerkly.2.3 */
      it('should handle DataManager errors', async () => {
        mockDataManager.saveData.mockReturnValue({ 
          success: false, 
          error: 'Database error' 
        });

        const result = await ipcHandlers.handleSaveData({}, 'key', 'value');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Database error');
      });

      /* Preconditions: DataManager.saveData takes longer than timeout
         Action: call handleSaveData with short timeout
         Assertions: returns success false with timeout error
         Requirements: clerkly.1.4, clerkly.2.3 */
      it('should handle timeout for save-data', async () => {
        // Set short timeout
        ipcHandlers.setTimeout(100);

        // Mock slow operation
        mockDataManager.saveData.mockReturnValue(
          new Promise(resolve => setTimeout(() => resolve({ success: true }), 500))
        );

        const result = await ipcHandlers.handleSaveData({}, 'key', 'value');

        expect(result.success).toBe(false);
        expect(result.error).toContain('timed out');
      });
    });

    describe('load-data handler', () => {
      /* Preconditions: DataManager.loadData returns success with data
         Action: call handleLoadData with valid key
         Assertions: returns success true with data, DataManager.loadData called with correct key
         Requirements: clerkly.1.4 */
      it('should handle valid load-data request', async () => {
        mockDataManager.loadData.mockReturnValue({ 
          success: true, 
          data: 'test-value' 
        });

        const result = await ipcHandlers.handleLoadData({}, 'test-key');

        expect(result.success).toBe(true);
        expect(result.data).toBe('test-value');
        expect(mockDataManager.loadData).toHaveBeenCalledWith('test-key');
      });

      /* Preconditions: IPCHandlers instance ready
         Action: call handleLoadData with null key
         Assertions: returns success false with error about required key
         Requirements: clerkly.1.4, clerkly.2.3 */
      it('should reject load-data with null key', async () => {
        const result = await ipcHandlers.handleLoadData({}, null);

        expect(result.success).toBe(false);
        expect(result.error).toContain('key is required');
        expect(mockDataManager.loadData).not.toHaveBeenCalled();
      });

      /* Preconditions: IPCHandlers instance ready
         Action: call handleLoadData with undefined key
         Assertions: returns success false with error about required key
         Requirements: clerkly.1.4, clerkly.2.3 */
      it('should reject load-data with undefined key', async () => {
        const result = await ipcHandlers.handleLoadData({}, undefined);

        expect(result.success).toBe(false);
        expect(result.error).toContain('key is required');
        expect(mockDataManager.loadData).not.toHaveBeenCalled();
      });

      /* Preconditions: DataManager.loadData returns key not found error
         Action: call handleLoadData with non-existent key
         Assertions: returns success false with key not found error
         Requirements: clerkly.1.4, clerkly.2.3 */
      it('should handle missing key', async () => {
        mockDataManager.loadData.mockReturnValue({ 
          success: false, 
          error: 'Key not found' 
        });

        const result = await ipcHandlers.handleLoadData({}, 'missing-key');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Key not found');
      });

      /* Preconditions: DataManager.loadData takes longer than timeout
         Action: call handleLoadData with short timeout
         Assertions: returns success false with timeout error
         Requirements: clerkly.1.4, clerkly.2.3 */
      it('should handle timeout for load-data', async () => {
        // Set short timeout
        ipcHandlers.setTimeout(100);

        // Mock slow operation
        mockDataManager.loadData.mockReturnValue(
          new Promise(resolve => setTimeout(() => resolve({ success: true, data: 'value' }), 500))
        );

        const result = await ipcHandlers.handleLoadData({}, 'key');

        expect(result.success).toBe(false);
        expect(result.error).toContain('timed out');
      });
    });

    describe('delete-data handler', () => {
      /* Preconditions: DataManager.deleteData returns success
         Action: call handleDeleteData with valid key
         Assertions: returns success true, DataManager.deleteData called with correct key
         Requirements: clerkly.1.4 */
      it('should handle valid delete-data request', async () => {
        mockDataManager.deleteData.mockReturnValue({ success: true });

        const result = await ipcHandlers.handleDeleteData({}, 'test-key');

        expect(result.success).toBe(true);
        expect(mockDataManager.deleteData).toHaveBeenCalledWith('test-key');
      });

      /* Preconditions: IPCHandlers instance ready
         Action: call handleDeleteData with null key
         Assertions: returns success false with error about required key
         Requirements: clerkly.1.4, clerkly.2.3 */
      it('should reject delete-data with null key', async () => {
        const result = await ipcHandlers.handleDeleteData({}, null);

        expect(result.success).toBe(false);
        expect(result.error).toContain('key is required');
        expect(mockDataManager.deleteData).not.toHaveBeenCalled();
      });

      /* Preconditions: IPCHandlers instance ready
         Action: call handleDeleteData with undefined key
         Assertions: returns success false with error about required key
         Requirements: clerkly.1.4, clerkly.2.3 */
      it('should reject delete-data with undefined key', async () => {
        const result = await ipcHandlers.handleDeleteData({}, undefined);

        expect(result.success).toBe(false);
        expect(result.error).toContain('key is required');
        expect(mockDataManager.deleteData).not.toHaveBeenCalled();
      });

      /* Preconditions: DataManager.deleteData returns key not found error
         Action: call handleDeleteData with non-existent key
         Assertions: returns success false with key not found error
         Requirements: clerkly.1.4, clerkly.2.3 */
      it('should handle missing key for delete', async () => {
        mockDataManager.deleteData.mockReturnValue({ 
          success: false, 
          error: 'Key not found' 
        });

        const result = await ipcHandlers.handleDeleteData({}, 'missing-key');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Key not found');
      });

      /* Preconditions: DataManager.deleteData takes longer than timeout
         Action: call handleDeleteData with short timeout
         Assertions: returns success false with timeout error
         Requirements: clerkly.1.4, clerkly.2.3 */
      it('should handle timeout for delete-data', async () => {
        // Set short timeout
        ipcHandlers.setTimeout(100);

        // Mock slow operation
        mockDataManager.deleteData.mockReturnValue(
          new Promise(resolve => setTimeout(() => resolve({ success: true }), 500))
        );

        const result = await ipcHandlers.handleDeleteData({}, 'key');

        expect(result.success).toBe(false);
        expect(result.error).toContain('timed out');
      });
    });

    describe('timeout configuration', () => {
      /* Preconditions: IPCHandlers instance created
         Action: call setTimeout with valid timeout value
         Assertions: timeout is updated, getTimeout returns new value
         Requirements: clerkly.1.4 */
      it('should allow setting timeout', () => {
        ipcHandlers.setTimeout(5000);
        expect(ipcHandlers.getTimeout()).toBe(5000);
      });

      /* Preconditions: IPCHandlers instance created
         Action: call setTimeout with negative value
         Assertions: throws error about positive number requirement
         Requirements: clerkly.1.4, clerkly.2.3 */
      it('should reject invalid timeout values', () => {
        expect(() => ipcHandlers.setTimeout(-1000)).toThrow('positive number');
        expect(() => ipcHandlers.setTimeout(0)).toThrow('positive number');
        expect(() => ipcHandlers.setTimeout('invalid')).toThrow('positive number');
      });
    });
  });

  describe('IPCClient - Renderer Process', () => {
    beforeEach(() => {
      // Mock ipcRenderer.invoke to simulate communication with main process
      ipcRenderer.invoke = jest.fn();
    });

    /* Preconditions: no IPCClient instance
       Action: create IPCClient with default timeout
       Assertions: instance created successfully with 10000ms timeout
       Requirements: clerkly.1.4 */
    it('should create IPCClient with default timeout', () => {
      const client = new IPCClient();
      expect(client.getTimeout()).toBe(10000);
    });

    /* Preconditions: no IPCClient instance
       Action: create IPCClient with custom timeout
       Assertions: instance created with specified timeout
       Requirements: clerkly.1.4 */
    it('should create IPCClient with custom timeout', () => {
      const client = new IPCClient(5000);
      expect(client.getTimeout()).toBe(5000);
    });

    /* Preconditions: no IPCClient instance
       Action: create IPCClient with invalid timeout
       Assertions: throws error about positive number requirement
       Requirements: clerkly.1.4, clerkly.2.3 */
    it('should reject invalid timeout in constructor', () => {
      expect(() => new IPCClient(-1000)).toThrow('positive number');
      expect(() => new IPCClient(0)).toThrow('positive number');
      expect(() => new IPCClient('invalid')).toThrow('positive number');
    });

    describe('saveData', () => {
      /* Preconditions: ipcRenderer.invoke returns success
         Action: call saveData with valid key and value
         Assertions: returns success true, ipcRenderer.invoke called with correct channel and params
         Requirements: clerkly.1.4, clerkly.2.4 */
      it('should send save-data request via IPC', async () => {
        ipcRenderer.invoke.mockResolvedValue({ success: true });

        const result = await ipcClient.saveData('test-key', 'test-value');

        expect(result.success).toBe(true);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith('save-data', 'test-key', 'test-value');
      });

      /* Preconditions: IPCClient instance ready
         Action: call saveData with null key
         Assertions: returns success false with error about required key, no IPC call made
         Requirements: clerkly.1.4, clerkly.2.3 */
      it('should reject save with null key', async () => {
        const result = await ipcClient.saveData(null, 'value');

        expect(result.success).toBe(false);
        expect(result.error).toContain('key is required');
        expect(ipcRenderer.invoke).not.toHaveBeenCalled();
      });

      /* Preconditions: IPCClient instance ready
         Action: call saveData with undefined value
         Assertions: returns success false with error about required value, no IPC call made
         Requirements: clerkly.1.4, clerkly.2.3 */
      it('should reject save with undefined value', async () => {
        const result = await ipcClient.saveData('key', undefined);

        expect(result.success).toBe(false);
        expect(result.error).toContain('value is required');
        expect(ipcRenderer.invoke).not.toHaveBeenCalled();
      });

      /* Preconditions: ipcRenderer.invoke takes longer than timeout
         Action: call saveData with short timeout
         Assertions: returns success false with timeout error and timeout flag
         Requirements: clerkly.1.4, clerkly.2.3 */
      it('should handle timeout for saveData', async () => {
        // Set short timeout
        ipcClient.setTimeout(100);

        // Mock slow IPC response
        ipcRenderer.invoke.mockImplementation(() => 
          new Promise(resolve => setTimeout(() => resolve({ success: true }), 500))
        );

        const result = await ipcClient.saveData('key', 'value');

        expect(result.success).toBe(false);
        expect(result.error).toContain('timed out');
        expect(result.timeout).toBe(true);
      });

      /* Preconditions: ipcRenderer.invoke rejects with error
         Action: call saveData
         Assertions: returns success false with error message
         Requirements: clerkly.1.4, clerkly.2.3 */
      it('should handle IPC errors', async () => {
        ipcRenderer.invoke.mockRejectedValue(new Error('IPC communication failed'));

        const result = await ipcClient.saveData('key', 'value');

        expect(result.success).toBe(false);
        expect(result.error).toContain('IPC communication failed');
      });
    });

    describe('loadData', () => {
      /* Preconditions: ipcRenderer.invoke returns success with data
         Action: call loadData with valid key
         Assertions: returns success true with data, ipcRenderer.invoke called with correct channel and key
         Requirements: clerkly.1.4, clerkly.2.4 */
      it('should send load-data request via IPC', async () => {
        ipcRenderer.invoke.mockResolvedValue({ success: true, data: 'test-value' });

        const result = await ipcClient.loadData('test-key');

        expect(result.success).toBe(true);
        expect(result.data).toBe('test-value');
        expect(ipcRenderer.invoke).toHaveBeenCalledWith('load-data', 'test-key');
      });

      /* Preconditions: IPCClient instance ready
         Action: call loadData with null key
         Assertions: returns success false with error about required key, no IPC call made
         Requirements: clerkly.1.4, clerkly.2.3 */
      it('should reject load with null key', async () => {
        const result = await ipcClient.loadData(null);

        expect(result.success).toBe(false);
        expect(result.error).toContain('key is required');
        expect(ipcRenderer.invoke).not.toHaveBeenCalled();
      });

      /* Preconditions: ipcRenderer.invoke takes longer than timeout
         Action: call loadData with short timeout
         Assertions: returns success false with timeout error and timeout flag
         Requirements: clerkly.1.4, clerkly.2.3 */
      it('should handle timeout for loadData', async () => {
        // Set short timeout
        ipcClient.setTimeout(100);

        // Mock slow IPC response
        ipcRenderer.invoke.mockImplementation(() => 
          new Promise(resolve => setTimeout(() => resolve({ success: true, data: 'value' }), 500))
        );

        const result = await ipcClient.loadData('key');

        expect(result.success).toBe(false);
        expect(result.error).toContain('timed out');
        expect(result.timeout).toBe(true);
      });

      /* Preconditions: ipcRenderer.invoke rejects with error
         Action: call loadData
         Assertions: returns success false with error message
         Requirements: clerkly.1.4, clerkly.2.3 */
      it('should handle IPC errors for load', async () => {
        ipcRenderer.invoke.mockRejectedValue(new Error('IPC communication failed'));

        const result = await ipcClient.loadData('key');

        expect(result.success).toBe(false);
        expect(result.error).toContain('IPC communication failed');
      });
    });

    describe('deleteData', () => {
      /* Preconditions: ipcRenderer.invoke returns success
         Action: call deleteData with valid key
         Assertions: returns success true, ipcRenderer.invoke called with correct channel and key
         Requirements: clerkly.1.4, clerkly.2.4 */
      it('should send delete-data request via IPC', async () => {
        ipcRenderer.invoke.mockResolvedValue({ success: true });

        const result = await ipcClient.deleteData('test-key');

        expect(result.success).toBe(true);
        expect(ipcRenderer.invoke).toHaveBeenCalledWith('delete-data', 'test-key');
      });

      /* Preconditions: IPCClient instance ready
         Action: call deleteData with null key
         Assertions: returns success false with error about required key, no IPC call made
         Requirements: clerkly.1.4, clerkly.2.3 */
      it('should reject delete with null key', async () => {
        const result = await ipcClient.deleteData(null);

        expect(result.success).toBe(false);
        expect(result.error).toContain('key is required');
        expect(ipcRenderer.invoke).not.toHaveBeenCalled();
      });

      /* Preconditions: ipcRenderer.invoke takes longer than timeout
         Action: call deleteData with short timeout
         Assertions: returns success false with timeout error and timeout flag
         Requirements: clerkly.1.4, clerkly.2.3 */
      it('should handle timeout for deleteData', async () => {
        // Set short timeout
        ipcClient.setTimeout(100);

        // Mock slow IPC response
        ipcRenderer.invoke.mockImplementation(() => 
          new Promise(resolve => setTimeout(() => resolve({ success: true }), 500))
        );

        const result = await ipcClient.deleteData('key');

        expect(result.success).toBe(false);
        expect(result.error).toContain('timed out');
        expect(result.timeout).toBe(true);
      });

      /* Preconditions: ipcRenderer.invoke rejects with error
         Action: call deleteData
         Assertions: returns success false with error message
         Requirements: clerkly.1.4, clerkly.2.3 */
      it('should handle IPC errors for delete', async () => {
        ipcRenderer.invoke.mockRejectedValue(new Error('IPC communication failed'));

        const result = await ipcClient.deleteData('key');

        expect(result.success).toBe(false);
        expect(result.error).toContain('IPC communication failed');
      });
    });

    describe('timeout configuration', () => {
      /* Preconditions: IPCClient instance created
         Action: call setTimeout with valid timeout value
         Assertions: timeout is updated, getTimeout returns new value
         Requirements: clerkly.1.4 */
      it('should allow setting timeout', () => {
        ipcClient.setTimeout(5000);
        expect(ipcClient.getTimeout()).toBe(5000);
      });

      /* Preconditions: IPCClient instance created
         Action: call setTimeout with negative value
         Assertions: throws error about positive number requirement
         Requirements: clerkly.1.4, clerkly.2.3 */
      it('should reject invalid timeout values', () => {
        expect(() => ipcClient.setTimeout(-1000)).toThrow('positive number');
        expect(() => ipcClient.setTimeout(0)).toThrow('positive number');
        expect(() => ipcClient.setTimeout('invalid')).toThrow('positive number');
      });
    });
  });

  describe('Integration - IPC Communication Flow', () => {
    beforeEach(() => {
      // Set up integration test environment
      // Mock ipcRenderer.invoke to call ipcMain handlers directly
      ipcRenderer.invoke = jest.fn((channel, ...args) => {
        const event = { sender: { send: jest.fn() } };
        return ipcMain._invokeHandler(channel, event, ...args);
      });
    });

    /* Preconditions: IPCHandlers and IPCClient set up, DataManager returns success
       Action: call ipcClient.saveData, which invokes ipcMain handler, which calls DataManager
       Assertions: data flows correctly through IPC, returns success
       Requirements: clerkly.1.4, clerkly.2.4 */
    it('should handle complete save-data flow from renderer to main', async () => {
      mockDataManager.saveData.mockReturnValue({ success: true });

      const result = await ipcClient.saveData('integration-key', 'integration-value');

      expect(result.success).toBe(true);
      expect(mockDataManager.saveData).toHaveBeenCalledWith('integration-key', 'integration-value');
    });

    /* Preconditions: IPCHandlers and IPCClient set up, DataManager returns data
       Action: call ipcClient.loadData, which invokes ipcMain handler, which calls DataManager
       Assertions: data flows correctly through IPC, returns success with data
       Requirements: clerkly.1.4, clerkly.2.4 */
    it('should handle complete load-data flow from renderer to main', async () => {
      mockDataManager.loadData.mockReturnValue({ 
        success: true, 
        data: 'integration-value' 
      });

      const result = await ipcClient.loadData('integration-key');

      expect(result.success).toBe(true);
      expect(result.data).toBe('integration-value');
      expect(mockDataManager.loadData).toHaveBeenCalledWith('integration-key');
    });

    /* Preconditions: IPCHandlers and IPCClient set up, DataManager returns success
       Action: call ipcClient.deleteData, which invokes ipcMain handler, which calls DataManager
       Assertions: data flows correctly through IPC, returns success
       Requirements: clerkly.1.4, clerkly.2.4 */
    it('should handle complete delete-data flow from renderer to main', async () => {
      mockDataManager.deleteData.mockReturnValue({ success: true });

      const result = await ipcClient.deleteData('integration-key');

      expect(result.success).toBe(true);
      expect(mockDataManager.deleteData).toHaveBeenCalledWith('integration-key');
    });

    /* Preconditions: IPCHandlers and IPCClient set up, DataManager returns error
       Action: call ipcClient.saveData with invalid data
       Assertions: error propagates correctly through IPC from main to renderer
       Requirements: clerkly.1.4, clerkly.2.3, clerkly.2.4 */
    it('should propagate errors from main to renderer', async () => {
      mockDataManager.saveData.mockReturnValue({ 
        success: false, 
        error: 'Database error' 
      });

      const result = await ipcClient.saveData('key', 'value');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });

    /* Preconditions: IPCHandlers and IPCClient set up with short timeout, DataManager operation is slow
       Action: call ipcClient.saveData with operation that exceeds timeout
       Assertions: timeout is handled correctly, returns timeout error
       Requirements: clerkly.1.4, clerkly.2.3, clerkly.2.4 */
    it('should handle timeout in complete IPC flow', async () => {
      // Set short timeout on both client and handler
      ipcClient.setTimeout(100);
      ipcHandlers.setTimeout(100);

      // Mock slow DataManager operation
      mockDataManager.saveData.mockReturnValue(
        new Promise(resolve => setTimeout(() => resolve({ success: true }), 500))
      );

      const result = await ipcClient.saveData('key', 'value');

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    });
  });
});
