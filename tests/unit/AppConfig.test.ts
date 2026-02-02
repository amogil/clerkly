// Requirements: clerkly.1, clerkly.2
import { AppConfig, WindowSettings } from '../../src/main/AppConfig';

describe('AppConfig', () => {
  let appConfig: AppConfig;

  beforeEach(() => {
    appConfig = new AppConfig();
  });

  /* Preconditions: AppConfig instance created
     Action: access version property
     Assertions: version is '1.0.0'
     Requirements: clerkly.1*/
  it('should have correct default version', () => {
    expect(appConfig.version).toBe('1.0.0');
  });

  /* Preconditions: AppConfig instance created
     Action: access platform property
     Assertions: platform is 'darwin' (Mac OS X)
     Requirements: clerkly.1*/
  it('should have correct default platform', () => {
    expect(appConfig.platform).toBe('darwin');
  });

  /* Preconditions: AppConfig instance created
     Action: access minOSVersion property
     Assertions: minOSVersion is '10.13'
     Requirements: clerkly.1*/
  it('should have correct minimum OS version', () => {
    expect(appConfig.minOSVersion).toBe('10.13');
  });

  /* Preconditions: AppConfig instance created
     Action: access windowSettings property
     Assertions: windowSettings contains correct default values (width: 800, height: 600, minWidth: 600, minHeight: 400, titleBarStyle: 'hiddenInset', vibrancy: 'under-window')
     Requirements: clerkly.1*/
  it('should have correct default window settings', () => {
    expect(appConfig.windowSettings).toEqual({
      width: 800,
      height: 600,
      minWidth: 600,
      minHeight: 400,
      titleBarStyle: 'hiddenInset',
      vibrancy: 'under-window',
    });
  });

  /* Preconditions: AppConfig instance created
     Action: call getVersion()
     Assertions: returns '1.0.0'
     Requirements: clerkly.1*/
  it('should return version via getVersion()', () => {
    expect(appConfig.getVersion()).toBe('1.0.0');
  });

  /* Preconditions: AppConfig instance created
     Action: call getPlatform()
     Assertions: returns 'darwin'
     Requirements: clerkly.1*/
  it('should return platform via getPlatform()', () => {
    expect(appConfig.getPlatform()).toBe('darwin');
  });

  /* Preconditions: AppConfig instance created
     Action: call getMinOSVersion()
     Assertions: returns '10.13'
     Requirements: clerkly.1*/
  it('should return minimum OS version via getMinOSVersion()', () => {
    expect(appConfig.getMinOSVersion()).toBe('10.13');
  });

  /* Preconditions: AppConfig instance created
     Action: call getWindowSettings()
     Assertions: returns copy of window settings with all default values
     Requirements: clerkly.1*/
  it('should return window settings via getWindowSettings()', () => {
    const settings = appConfig.getWindowSettings();
    expect(settings).toEqual({
      width: 800,
      height: 600,
      minWidth: 600,
      minHeight: 400,
      titleBarStyle: 'hiddenInset',
      vibrancy: 'under-window',
    });
  });

  /* Preconditions: AppConfig instance created
     Action: call getWindowSettings(), modify returned object
     Assertions: internal windowSettings remain unchanged (immutability)
     Requirements: clerkly.1*/
  it('should return immutable copy of window settings', () => {
    const settings = appConfig.getWindowSettings();
    settings.width = 1000;
    settings.height = 800;

    expect(appConfig.windowSettings.width).toBe(800);
    expect(appConfig.windowSettings.height).toBe(600);
  });

  /* Preconditions: AppConfig instance created with default settings
     Action: call updateWindowSettings with partial settings (width: 1024, height: 768)
     Assertions: window settings updated with new values, other settings remain unchanged
     Requirements: clerkly.1*/
  it('should update window settings partially', () => {
    appConfig.updateWindowSettings({ width: 1024, height: 768 });

    expect(appConfig.windowSettings.width).toBe(1024);
    expect(appConfig.windowSettings.height).toBe(768);
    expect(appConfig.windowSettings.minWidth).toBe(600);
    expect(appConfig.windowSettings.minHeight).toBe(400);
    expect(appConfig.windowSettings.titleBarStyle).toBe('hiddenInset');
    expect(appConfig.windowSettings.vibrancy).toBe('under-window');
  });

  /* Preconditions: AppConfig instance created
     Action: call updateWindowSettings with single property (titleBarStyle: 'hidden')
     Assertions: only titleBarStyle is updated, all other settings remain unchanged
     Requirements: clerkly.1*/
  it('should update single window setting', () => {
    appConfig.updateWindowSettings({ titleBarStyle: 'hidden' });

    expect(appConfig.windowSettings.titleBarStyle).toBe('hidden');
    expect(appConfig.windowSettings.width).toBe(800);
    expect(appConfig.windowSettings.height).toBe(600);
    expect(appConfig.windowSettings.vibrancy).toBe('under-window');
  });

  /* Preconditions: AppConfig instance created
     Action: call updateWindowSettings with all properties
     Assertions: all window settings are updated to new values
     Requirements: clerkly.1*/
  it('should update all window settings', () => {
    const newSettings: WindowSettings = {
      width: 1920,
      height: 1080,
      minWidth: 800,
      minHeight: 600,
      titleBarStyle: 'default',
      vibrancy: 'light',
    };

    appConfig.updateWindowSettings(newSettings);

    expect(appConfig.windowSettings).toEqual(newSettings);
  });

  /* Preconditions: AppConfig instance created
     Action: access windowSettings.titleBarStyle
     Assertions: titleBarStyle is 'hiddenInset' (Mac OS X native style)
     Requirements: clerkly.1*/
  it('should have Mac OS X native titleBarStyle', () => {
    expect(appConfig.windowSettings.titleBarStyle).toBe('hiddenInset');
  });

  /* Preconditions: AppConfig instance created
     Action: access windowSettings.vibrancy
     Assertions: vibrancy is 'under-window' (Mac OS X native effect)
     Requirements: clerkly.1*/
  it('should have Mac OS X native vibrancy', () => {
    expect(appConfig.windowSettings.vibrancy).toBe('under-window');
  });

  /* Preconditions: AppConfig instance created
     Action: access windowSettings minimum dimensions
     Assertions: minWidth is 600, minHeight is 400
     Requirements: clerkly.1*/
  it('should have correct minimum window dimensions', () => {
    expect(appConfig.windowSettings.minWidth).toBe(600);
    expect(appConfig.windowSettings.minHeight).toBe(400);
  });

  /* Preconditions: AppConfig instance created
     Action: access windowSettings default dimensions
     Assertions: width is 800, height is 600
     Requirements: clerkly.1*/
  it('should have correct default window dimensions', () => {
    expect(appConfig.windowSettings.width).toBe(800);
    expect(appConfig.windowSettings.height).toBe(600);
  });
});
