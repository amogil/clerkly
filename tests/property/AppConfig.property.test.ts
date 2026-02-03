// Requirements: clerkly.1.1, clerkly.1.2, clerkly.1.4

import * as fc from 'fast-check';
import { AppConfig } from '../../src/main/AppConfig';

describe('Property Tests - AppConfig', () => {
  /**
   * Property 20: Configuration Immutability
   * For any configuration access, the returned values should not affect
   * the internal state when mutated.
   * **Validates: Requirements clerkly.1**
   */
  describe('Property 20: Configuration Immutability', () => {
    /* Preconditions: AppConfig initialized
       Action: get window settings, mutate returned object
       Assertions: internal settings remain unchanged
       Requirements: clerkly.1 */
    it('should return immutable copy of window settings', () => {
      fc.assert(
        fc.property(
          fc.record({
            width: fc.integer({ min: 100, max: 5000 }),
            height: fc.integer({ min: 100, max: 5000 }),
            minWidth: fc.integer({ min: 100, max: 1000 }),
            minHeight: fc.integer({ min: 100, max: 1000 }),
          }),
          (mutations) => {
            const config = new AppConfig();
            const originalSettings = config.getWindowSettings();

            // Get settings and mutate
            const settings = config.getWindowSettings();
            settings.width = mutations.width;
            settings.height = mutations.height;
            settings.minWidth = mutations.minWidth;
            settings.minHeight = mutations.minHeight;
            settings.titleBarStyle = 'MUTATED';
            settings.vibrancy = 'MUTATED';

            // Get settings again
            const settingsAfter = config.getWindowSettings();

            // Property: Internal settings unchanged
            expect(settingsAfter).toEqual(originalSettings);
            expect(settingsAfter.width).toBe(originalSettings.width);
            expect(settingsAfter.height).toBe(originalSettings.height);
            expect(settingsAfter.titleBarStyle).toBe(originalSettings.titleBarStyle);
            expect(settingsAfter.vibrancy).toBe(originalSettings.vibrancy);
          }
        ),
        { numRuns: 100 }
      );
    });

    /* Preconditions: AppConfig initialized
       Action: update window settings with various values
       Assertions: only specified fields are updated, others remain unchanged
       Requirements: clerkly.1 */
    it('should update only specified window settings', () => {
      fc.assert(
        fc.property(
          fc.record({
            width: fc.option(fc.integer({ min: 600, max: 3000 }), { nil: undefined }),
            height: fc.option(fc.integer({ min: 400, max: 2000 }), { nil: undefined }),
            minWidth: fc.option(fc.integer({ min: 400, max: 800 }), { nil: undefined }),
            minHeight: fc.option(fc.integer({ min: 300, max: 600 }), { nil: undefined }),
            titleBarStyle: fc.option(fc.constantFrom('default', 'hidden', 'hiddenInset'), {
              nil: undefined,
            }),
            vibrancy: fc.option(fc.constantFrom('under-window', 'sidebar', 'menu', 'popover'), {
              nil: undefined,
            }),
          }),
          (updates) => {
            const config = new AppConfig();
            const originalSettings = config.getWindowSettings();

            // Update settings
            config.updateWindowSettings(updates);
            const updatedSettings = config.getWindowSettings();

            // Property: Updated fields have new values
            if (updates.width !== undefined) {
              expect(updatedSettings.width).toBe(updates.width);
            } else {
              expect(updatedSettings.width).toBe(originalSettings.width);
            }

            if (updates.height !== undefined) {
              expect(updatedSettings.height).toBe(updates.height);
            } else {
              expect(updatedSettings.height).toBe(originalSettings.height);
            }

            if (updates.minWidth !== undefined) {
              expect(updatedSettings.minWidth).toBe(updates.minWidth);
            } else {
              expect(updatedSettings.minWidth).toBe(originalSettings.minWidth);
            }

            if (updates.minHeight !== undefined) {
              expect(updatedSettings.minHeight).toBe(updates.minHeight);
            } else {
              expect(updatedSettings.minHeight).toBe(originalSettings.minHeight);
            }

            if (updates.titleBarStyle !== undefined) {
              expect(updatedSettings.titleBarStyle).toBe(updates.titleBarStyle);
            } else {
              expect(updatedSettings.titleBarStyle).toBe(originalSettings.titleBarStyle);
            }

            if (updates.vibrancy !== undefined) {
              expect(updatedSettings.vibrancy).toBe(updates.vibrancy);
            } else {
              expect(updatedSettings.vibrancy).toBe(originalSettings.vibrancy);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /* Preconditions: AppConfig initialized
       Action: get version, platform, minOSVersion multiple times
       Assertions: values are consistent across calls
       Requirements: clerkly.1.1, clerkly.1.2 */
    it('should return consistent configuration values', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const config = new AppConfig();

          // Get values multiple times
          const version1 = config.getVersion();
          const version2 = config.getVersion();
          const version3 = config.getVersion();

          const platform1 = config.getPlatform();
          const platform2 = config.getPlatform();

          const minOS1 = config.getMinOSVersion();
          const minOS2 = config.getMinOSVersion();

          // Property: Values are consistent
          expect(version1).toBe(version2);
          expect(version2).toBe(version3);
          expect(platform1).toBe(platform2);
          expect(minOS1).toBe(minOS2);

          // Property: Values match expected
          expect(version1).toBe('1.0.0');
          expect(platform1).toBe('darwin');
          expect(minOS1).toBe('10.13');
        }),
        { numRuns: 100 }
      );
    });

    /* Preconditions: AppConfig initialized
       Action: verify default window settings
       Assertions: default settings have correct values for Mac OS X
       Requirements: clerkly.1.2 */
    it('should have correct default window settings for Mac OS X', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const config = new AppConfig();
          const settings = config.getWindowSettings();

          // Property: Default dimensions are reasonable
          expect(settings.width).toBe(800);
          expect(settings.height).toBe(600);
          expect(settings.minWidth).toBe(600);
          expect(settings.minHeight).toBe(400);

          // Property: Mac OS X native styling
          expect(settings.titleBarStyle).toBe('hiddenInset');
          expect(settings.vibrancy).toBe('under-window');

          // Property: Min dimensions are less than default dimensions
          expect(settings.minWidth).toBeLessThanOrEqual(settings.width);
          expect(settings.minHeight).toBeLessThanOrEqual(settings.height);
        }),
        { numRuns: 100 }
      );
    });

    /* Preconditions: AppConfig initialized
       Action: update settings multiple times in sequence
       Assertions: each update correctly modifies settings
       Requirements: clerkly.1 */
    it('should handle sequential updates correctly', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              width: fc.option(fc.integer({ min: 600, max: 3000 }), { nil: undefined }),
              height: fc.option(fc.integer({ min: 400, max: 2000 }), { nil: undefined }),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (updateSequence) => {
            const config = new AppConfig();
            let expectedWidth = 800; // default
            let expectedHeight = 600; // default

            for (const update of updateSequence) {
              config.updateWindowSettings(update);

              if (update.width !== undefined) {
                expectedWidth = update.width;
              }
              if (update.height !== undefined) {
                expectedHeight = update.height;
              }

              const settings = config.getWindowSettings();
              expect(settings.width).toBe(expectedWidth);
              expect(settings.height).toBe(expectedHeight);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    /* Preconditions: AppConfig initialized
       Action: update with empty object
       Assertions: settings remain unchanged
       Requirements: clerkly.1 */
    it('should handle empty updates without changing settings', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const config = new AppConfig();
          const originalSettings = config.getWindowSettings();

          // Update with empty object
          config.updateWindowSettings({});

          const settingsAfter = config.getWindowSettings();

          // Property: Settings unchanged
          expect(settingsAfter).toEqual(originalSettings);
        }),
        { numRuns: 100 }
      );
    });

    /* Preconditions: AppConfig initialized
       Action: verify platform is darwin
       Assertions: platform is always darwin for Mac OS X
       Requirements: clerkly.1.2 */
    it('should always return darwin as platform', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const config = new AppConfig();
          const platform = config.getPlatform();

          // Property: Platform is darwin
          expect(platform).toBe('darwin');

          // Property: Platform is consistent
          expect(config.getPlatform()).toBe(platform);
        }),
        { numRuns: 100 }
      );
    });

    /* Preconditions: AppConfig initialized
       Action: verify minimum OS version
       Assertions: minimum OS version is 10.13 or higher
       Requirements: clerkly.1.2 */
    it('should have minimum OS version 10.13 or higher', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const config = new AppConfig();
          const minOS = config.getMinOSVersion();

          // Property: Min OS version is defined
          expect(minOS).toBeDefined();
          expect(minOS).toBe('10.13');

          // Property: Version format is correct
          expect(minOS).toMatch(/^\d+\.\d+$/);
        }),
        { numRuns: 100 }
      );
    });

    /* Preconditions: Multiple AppConfig instances
       Action: create multiple instances, verify independence
       Assertions: instances are independent, updates don't affect each other
       Requirements: clerkly.1 */
    it('should maintain independence between multiple instances', () => {
      fc.assert(
        fc.property(
          fc.record({
            width1: fc.integer({ min: 600, max: 2000 }),
            width2: fc.integer({ min: 600, max: 2000 }),
            height1: fc.integer({ min: 400, max: 1500 }),
            height2: fc.integer({ min: 400, max: 1500 }),
          }),
          (updates) => {
            // Ensure different values
            fc.pre(updates.width1 !== updates.width2 || updates.height1 !== updates.height2);

            const config1 = new AppConfig();
            const config2 = new AppConfig();

            // Update first instance
            config1.updateWindowSettings({
              width: updates.width1,
              height: updates.height1,
            });

            // Update second instance
            config2.updateWindowSettings({
              width: updates.width2,
              height: updates.height2,
            });

            // Property: Instances are independent
            const settings1 = config1.getWindowSettings();
            const settings2 = config2.getWindowSettings();

            expect(settings1.width).toBe(updates.width1);
            expect(settings1.height).toBe(updates.height1);
            expect(settings2.width).toBe(updates.width2);
            expect(settings2.height).toBe(updates.height2);

            // Property: Updates don't affect each other
            if (updates.width1 !== updates.width2) {
              expect(settings1.width).not.toBe(settings2.width);
            }
            if (updates.height1 !== updates.height2) {
              expect(settings1.height).not.toBe(settings2.height);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
