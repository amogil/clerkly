// Requirements: testing.7.1, testing.7.2, testing.7.3, testing.7.4

/**
 * Check if a graphical environment is available for running Electron tests
 * @returns true if graphical environment is available, false otherwise
 */
export function checkGraphicalEnvironment(): boolean {
  const platform = process.platform;

  if (platform === 'linux') {
    // Check for X11 or Wayland display
    return !!process.env.DISPLAY || !!process.env.WAYLAND_DISPLAY;
  }

  if (platform === 'darwin') {
    // macOS always has a graphical environment unless running headless
    return true;
  }

  if (platform === 'win32') {
    // Windows always has a graphical environment
    return true;
  }

  return false;
}

/**
 * Skip test if no graphical environment is available
 * @param testName Name of the test being skipped
 */
export function skipIfNoGraphicalEnvironment(testName: string): void {
  if (!checkGraphicalEnvironment()) {
    console.warn(`⚠️  Skipping ${testName}: No graphical environment available`);
    console.warn('Integration and functional tests require a graphical environment.');
    console.warn('On Linux, ensure DISPLAY or WAYLAND_DISPLAY environment variable is set.');
  }
}
