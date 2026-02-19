// Requirements: error-notifications.2.1, error-notifications.2.2, error-notifications.2.3, error-notifications.2.4, error-notifications.2.5, error-notifications.2.6

import { callApi } from '../../../src/renderer/utils/apiWrapper';
import { toast } from 'sonner';

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
  },
}));

describe('apiWrapper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('callApi', () => {
    /* Preconditions: IPC call returns success with data
       Action: call callApi()
       Assertions: returns data, no toast shown
       Requirements: error-notifications.2.5 */
    it('should return data on success', async () => {
      const mockData = { id: '123', name: 'Test' };
      const apiCall = jest.fn().mockResolvedValue({
        success: true,
        data: mockData,
      });

      const result = await callApi(apiCall, 'Test operation');

      expect(result).toEqual(mockData);
      expect(toast.error).not.toHaveBeenCalled();
    });

    /* Preconditions: IPC call returns success: false with error message
       Action: call callApi()
       Assertions: returns null, toast shown with context and error
       Requirements: error-notifications.2.3, error-notifications.2.5 */
    it('should show toast and return null on IPC error', async () => {
      const apiCall = jest.fn().mockResolvedValue({
        success: false,
        error: 'Network error',
      });

      const result = await callApi(apiCall, 'Loading data');

      expect(result).toBeNull();
      expect(toast.error).toHaveBeenCalledWith('Loading data: Network error');
    });

    /* Preconditions: IPC call returns success: false without error message
       Action: call callApi()
       Assertions: returns null, toast shown with "Unknown error"
       Requirements: error-notifications.2.3, error-notifications.2.5 */
    it('should show toast with "Unknown error" when error message is missing', async () => {
      const apiCall = jest.fn().mockResolvedValue({
        success: false,
      });

      const result = await callApi(apiCall, 'Loading data');

      expect(result).toBeNull();
      expect(toast.error).toHaveBeenCalledWith('Loading data: Unknown error');
    });

    /* Preconditions: IPC call throws exception
       Action: call callApi()
       Assertions: returns null, toast shown with exception message
       Requirements: error-notifications.2.4, error-notifications.2.5 */
    it('should show toast and return null on exception', async () => {
      const apiCall = jest.fn().mockRejectedValue(new Error('Connection failed'));

      const result = await callApi(apiCall, 'Fetching profile');

      expect(result).toBeNull();
      expect(toast.error).toHaveBeenCalledWith('Fetching profile: Connection failed');
    });

    /* Preconditions: IPC call throws non-Error exception
       Action: call callApi()
       Assertions: returns null, toast shown with string representation
       Requirements: error-notifications.2.4, error-notifications.2.5 */
    it('should handle non-Error exceptions', async () => {
      const apiCall = jest.fn().mockRejectedValue('String error');

      const result = await callApi(apiCall, 'Test operation');

      expect(result).toBeNull();
      expect(toast.error).toHaveBeenCalledWith('Test operation: String error');
    });

    /* Preconditions: IPC call returns error, silent option is true
       Action: call callApi() with silent: true
       Assertions: returns null, no toast shown
       Requirements: error-notifications.2.6 */
    it('should not show toast when silent option is true', async () => {
      const apiCall = jest.fn().mockResolvedValue({
        success: false,
        error: 'Network error',
      });

      const result = await callApi(apiCall, 'Loading data', { silent: true });

      expect(result).toBeNull();
      expect(toast.error).not.toHaveBeenCalled();
    });

    /* Preconditions: IPC call throws exception, silent option is true
       Action: call callApi() with silent: true
       Assertions: returns null, no toast shown
       Requirements: error-notifications.2.6 */
    it('should not show toast on exception when silent option is true', async () => {
      const apiCall = jest.fn().mockRejectedValue(new Error('Connection failed'));

      const result = await callApi(apiCall, 'Fetching profile', { silent: true });

      expect(result).toBeNull();
      expect(toast.error).not.toHaveBeenCalled();
    });

    /* Preconditions: IPC call returns success with undefined data
       Action: call callApi()
       Assertions: returns null, toast shown
       Requirements: error-notifications.2.3, error-notifications.2.5 */
    it('should treat undefined data as error', async () => {
      const apiCall = jest.fn().mockResolvedValue({
        success: true,
        data: undefined,
      });

      const result = await callApi(apiCall, 'Loading data');

      expect(result).toBeNull();
      expect(toast.error).toHaveBeenCalledWith('Loading data: Unknown error');
    });

    /* Preconditions: IPC call returns success with null data
       Action: call callApi()
       Assertions: returns null, no toast (null is valid data when success is true)
       Requirements: error-notifications.2.5 */
    it('should treat null as valid data when success is true', async () => {
      const apiCall = jest.fn().mockResolvedValue({
        success: true,
        data: null,
      });

      const result = await callApi(apiCall, 'Loading data');

      expect(result).toBeNull();
      expect(toast.error).not.toHaveBeenCalled();
    });

    /* Preconditions: IPC call returns success with empty array
       Action: call callApi()
       Assertions: returns empty array, no toast
       Requirements: error-notifications.2.5 */
    it('should handle empty array as valid data', async () => {
      const apiCall = jest.fn().mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await callApi(apiCall, 'Loading data');

      expect(result).toEqual([]);
      expect(toast.error).not.toHaveBeenCalled();
    });

    /* Preconditions: IPC call returns success with zero
       Action: call callApi()
       Assertions: returns zero, no toast
       Requirements: error-notifications.2.5 */
    it('should handle zero as valid data', async () => {
      const apiCall = jest.fn().mockResolvedValue({
        success: true,
        data: 0,
      });

      const result = await callApi(apiCall, 'Loading count');

      expect(result).toBe(0);
      expect(toast.error).not.toHaveBeenCalled();
    });

    /* Preconditions: IPC call returns success with false
       Action: call callApi()
       Assertions: returns false, no toast
       Requirements: error-notifications.2.5 */
    it('should handle false as valid data', async () => {
      const apiCall = jest.fn().mockResolvedValue({
        success: true,
        data: false,
      });

      const result = await callApi(apiCall, 'Checking status');

      expect(result).toBe(false);
      expect(toast.error).not.toHaveBeenCalled();
    });
  });
});
