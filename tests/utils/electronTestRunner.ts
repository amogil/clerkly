// Requirements: testing.3.1, testing.4.1, testing.7.1, testing.7.2, testing.7.3, testing.7.4

import { spawn, ChildProcess } from 'child_process';
import * as os from 'os';

/**
 * Electron Test Runner
 *
 * Utility for running tests in real Electron environment.
 * Handles Electron process lifecycle and environment detection.
 */

/**
 * Check if graphical environment is available
 *
 * Requirements: testing.7.4
 *
 * @returns true if graphical environment is available
 */
export function isGraphicalEnvironmentAvailable(): boolean {
  const platform = os.platform();

  if (platform === 'darwin') {
    // macOS always has graphical environment when running
    return true;
  }

  if (platform === 'linux') {
    // Check for X11 or Wayland
    return !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  }

  if (platform === 'win32') {
    // Windows always has graphical environment when running
    return true;
  }

  return false;
}

/**
 * Skip test if graphical environment is not available
 *
 * Requirements: testing.7.4
 */
export function skipIfNoGraphicalEnvironment(): void {
  if (!isGraphicalEnvironmentAvailable()) {
    console.warn(
      'Skipping test: Graphical environment not available. ' +
        'Set DISPLAY or WAYLAND_DISPLAY environment variable on Linux.'
    );
    // Use Jest's skip functionality
    if (typeof test !== 'undefined' && test.skip) {
      test.skip('Graphical environment not available', () => {});
    }
  }
}

/**
 * Electron process wrapper for tests
 */
export class ElectronTestProcess {
  private process: ChildProcess | null = null;
  private ready = false;

  /**
   * Start Electron process
   *
   * Requirements: testing.3.1, testing.4.1
   *
   * @param mainScript - Path to main script to run
   * @param args - Additional arguments
   * @returns Promise that resolves when Electron is ready
   */
  async start(mainScript: string, args: string[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      const electronPath = require('electron') as string;

      // Requirements: testing.3.1, testing.4.1
      this.process = spawn(electronPath, [mainScript, ...args], {
        env: {
          ...process.env,
          NODE_ENV: 'test',
          ELECTRON_ENABLE_LOGGING: '1',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (!this.process) {
        reject(new Error('Failed to start Electron process'));
        return;
      }

      // Handle stdout
      this.process.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        console.log('[Electron]', output);

        // Check if Electron is ready
        if (output.includes('ready')) {
          this.ready = true;
          resolve();
        }
      });

      // Handle stderr
      this.process.stderr?.on('data', (data: Buffer) => {
        console.error('[Electron Error]', data.toString());
      });

      // Handle process exit
      this.process.on('exit', (code: number | null) => {
        console.log(`[Electron] Process exited with code ${code}`);
        this.ready = false;
      });

      // Handle errors
      this.process.on('error', (error: Error) => {
        console.error('[Electron] Process error:', error);
        reject(error);
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!this.ready) {
          reject(new Error('Electron process did not become ready within 10 seconds'));
        }
      }, 10000);
    });
  }

  /**
   * Stop Electron process
   */
  async stop(): Promise<void> {
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');

      // Wait for process to exit
      await new Promise<void>((resolve) => {
        if (!this.process) {
          resolve();
          return;
        }

        this.process.on('exit', () => {
          resolve();
        });

        // Force kill after 5 seconds
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.process.kill('SIGKILL');
          }
          resolve();
        }, 5000);
      });
    }

    this.process = null;
    this.ready = false;
  }

  /**
   * Check if Electron process is running
   */
  isRunning(): boolean {
    return this.ready && this.process !== null && !this.process.killed;
  }
}

/**
 * Wait for condition to be true
 *
 * @param condition - Function that returns true when condition is met
 * @param timeout - Timeout in milliseconds
 * @param interval - Check interval in milliseconds
 * @returns Promise that resolves when condition is met
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await Promise.resolve(condition());
    if (result) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}
