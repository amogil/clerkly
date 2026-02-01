// Requirements: clerkly.1.4
import { ipcRenderer } from 'electron';

interface IPCResult {
  success: boolean;
  data?: any;
  error?: string;
  timeout?: boolean;
}

class IPCClient {
  private timeout: number;

  // Requirements: clerkly.1.4
  constructor(timeout: number = 10000) {
    if (typeof timeout !== 'number' || timeout <= 0) {
      throw new Error('Timeout must be a positive number');
    }
    this.timeout = timeout;
  }

  // Requirements: clerkly.1.4
  async saveData(key: string, value: any): Promise<IPCResult> {
    try {
      if (key === undefined || key === null) {
        return { success: false, error: 'Invalid parameters: key is required' };
      }

      if (value === undefined) {
        return { success: false, error: 'Invalid parameters: value is required' };
      }

      const result = await this.withTimeout(
        ipcRenderer.invoke('save-data', key, value),
        this.timeout,
        'save-data request timed out'
      );

      return result;
    } catch (error: any) {
      if (error.message && error.message.includes('timed out')) {
        return { success: false, error: 'Request timed out', timeout: true };
      }
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  // Requirements: clerkly.1.4
  async loadData(key: string): Promise<IPCResult> {
    try {
      if (key === undefined || key === null) {
        return { success: false, error: 'Invalid parameters: key is required' };
      }

      const result = await this.withTimeout(
        ipcRenderer.invoke('load-data', key),
        this.timeout,
        'load-data request timed out'
      );

      return result;
    } catch (error: any) {
      if (error.message && error.message.includes('timed out')) {
        return { success: false, error: 'Request timed out', timeout: true };
      }
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  // Requirements: clerkly.1.4
  async deleteData(key: string): Promise<IPCResult> {
    try {
      if (key === undefined || key === null) {
        return { success: false, error: 'Invalid parameters: key is required' };
      }

      const result = await this.withTimeout(
        ipcRenderer.invoke('delete-data', key),
        this.timeout,
        'delete-data request timed out'
      );

      return result;
    } catch (error: any) {
      if (error.message && error.message.includes('timed out')) {
        return { success: false, error: 'Request timed out', timeout: true };
      }
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  // Requirements: clerkly.1.4
  withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(new Error(timeoutMessage));
        }, timeoutMs);
      })
    ]);
  }

  // Requirements: clerkly.1.4
  setTimeout(timeoutMs: number): void {
    if (typeof timeoutMs !== 'number' || timeoutMs <= 0) {
      throw new Error('Timeout must be a positive number');
    }
    this.timeout = timeoutMs;
  }

  // Requirements: clerkly.1.4
  getTimeout(): number {
    return this.timeout;
  }
}

export default IPCClient;
