// Requirements: clerkly.1
/**
 * Window settings interface
 */
export interface WindowSettings {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  titleBarStyle: string;
  vibrancy: string;
}

/**
 * Application configuration class
 * Defines application settings including window configuration,
 * version information, and platform requirements
 */
export class AppConfig {
  /**
   * Application version
   */
  version: string = '1.0.0';

  /**
   * Target platform (darwin for Mac OS X)
   */
  platform: string = 'darwin';

  /**
   * Minimum supported Mac OS X version
   */
  minOSVersion: string = '10.13';

  /**
   * Window configuration settings
   * Includes native Mac OS X styling (hiddenInset titlebar, vibrancy)
   */
  windowSettings: WindowSettings = {
    width: 800,
    height: 600,
    minWidth: 600,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
  };

  /**
   * Get the current application version
   * @returns {string} Application version
   */
  getVersion(): string {
    return this.version;
  }

  /**
   * Get the target platform
   * @returns {string} Platform identifier
   */
  getPlatform(): string {
    return this.platform;
  }

  /**
   * Get the minimum OS version requirement
   * @returns {string} Minimum OS version
   */
  getMinOSVersion(): string {
    return this.minOSVersion;
  }

  /**
   * Get window settings
   * @returns {WindowSettings} Window configuration
   */
  getWindowSettings(): WindowSettings {
    return { ...this.windowSettings };
  }

  /**
   * Update window settings
   * @param {Partial<WindowSettings>} settings - Settings to update
   */
  updateWindowSettings(settings: Partial<WindowSettings>): void {
    this.windowSettings = { ...this.windowSettings, ...settings };
  }
}
