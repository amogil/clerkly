// Requirements: testing.3.1, testing.3.2

import type {
  IDataManager,
  InitializeResult,
  SaveDataResult,
  LoadDataResult,
  DeleteDataResult,
} from './DataManager';
import type { UserProfileManager } from './auth/UserProfileManager';
import { Logger } from './Logger';

/**
 * Test wrapper for DataManager that can simulate errors
 * Only available in test environment
 * Requirements: testing.3.1, testing.3.2
 */
export class TestDataManager implements IDataManager {
  private dataManager: IDataManager;
  private logger = Logger.create('TestDataManager');
  private errorSimulation: {
    saveData?: string;
    loadData?: string;
    deleteData?: string;
  } = {};

  constructor(dataManager: IDataManager) {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('TestDataManager can only be used in test environment');
    }
    this.dataManager = dataManager;
    this.logger.info('TestDataManager initialized');
  }

  /**
   * Configure error simulation for next operation
   * Requirements: testing.3.1, testing.3.2
   *
   * @param operation Operation to simulate error for
   * @param errorMessage Error message to return
   */
  simulateError(operation: 'saveData' | 'loadData' | 'deleteData', errorMessage: string): void {
    this.errorSimulation[operation] = errorMessage;
    this.logger.info(`Error simulation configured for ${operation}: ${errorMessage}`);
  }

  /**
   * Clear all error simulations
   * Requirements: testing.3.1, testing.3.2
   */
  clearErrorSimulations(): void {
    this.errorSimulation = {};
    this.logger.info('All error simulations cleared');
  }

  /**
   * Wrap saveData with error simulation
   * Requirements: testing.3.1, testing.3.2
   */
  saveData(key: string, value: unknown): SaveDataResult {
    if (this.errorSimulation.saveData) {
      const error = this.errorSimulation.saveData;
      this.errorSimulation.saveData = undefined; // One-time error
      this.logger.info(`Simulating saveData error: ${error}`);
      return { success: false, error };
    }
    return this.dataManager.saveData(key, value);
  }

  /**
   * Wrap loadData with error simulation
   * Requirements: testing.3.1, testing.3.2
   */
  loadData(key: string): LoadDataResult {
    if (this.errorSimulation.loadData) {
      const error = this.errorSimulation.loadData;
      this.errorSimulation.loadData = undefined; // One-time error
      this.logger.info(`Simulating loadData error: ${error}`);
      return { success: false, error };
    }
    return this.dataManager.loadData(key);
  }

  /**
   * Wrap deleteData with error simulation
   * Requirements: testing.3.1, testing.3.2
   */
  deleteData(key: string): DeleteDataResult {
    if (this.errorSimulation.deleteData) {
      const error = this.errorSimulation.deleteData;
      this.errorSimulation.deleteData = undefined; // One-time error
      this.logger.info(`Simulating deleteData error: ${error}`);
      return { success: false, error };
    }
    return this.dataManager.deleteData(key);
  }

  // Delegate other methods to real DataManager
  initialize(dbPath: string): InitializeResult {
    return this.dataManager.initialize(dbPath);
  }

  close(): void {
    return this.dataManager.close();
  }

  setUserProfileManager(profileManager: UserProfileManager): void {
    return this.dataManager.setUserProfileManager(profileManager);
  }
}
