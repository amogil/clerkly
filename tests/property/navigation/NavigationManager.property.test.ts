/* Feature: ui, Property 8: Показ экрана логина для неавторизованных пользователей
   Feature: ui, Property 9: Показ Dashboard после успешной авторизации
   Feature: ui, Property 24: Показ экрана логина для неавторизованных пользователей
   Feature: ui, Property 26: Перенаправление на Dashboard после успешной авторизации
   Feature: ui, Property 27: Перенаправление на Login после logout
   Preconditions: NavigationManager with various auth states and routes
   Action: call initialize(), redirectToLogin(), redirectToDashboard()
   Assertions: correct navigation behavior based on auth status
   Requirements: navigation.1.1, navigation.1.3, navigation.1.4 */

import fc from 'fast-check';
import { NavigationManager } from '../../../src/renderer/navigation/NavigationManager';
import type { Router } from '../../../src/renderer/navigation/Router';

// Mock window.api.auth
const mockGetStatus = jest.fn();
global.window = {
  api: {
    auth: {
      getStatus: mockGetStatus,
    },
  },
} as any;

describe('NavigationManager Property Tests', () => {
  /* Feature: ui, Property 8, 24: Показ экрана логина для неавторизованных пользователей
     Preconditions: user not authorized, various initial routes
     Action: call initialize()
     Assertions: always redirects to login
     Requirements: navigation.1.1 */
  it('should always redirect to login when not authorized', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('/dashboard', '/settings', '/tasks', '/calendar', '/contacts', '/login'),
        async (initialRoute) => {
          // Setup
          mockGetStatus.mockResolvedValue({ authorized: false });
          const navigateMock = jest.fn();
          const mockRouter: Router = {
            navigate: navigateMock,
            currentRoute: initialRoute,
          };
          const navigationManager = new NavigationManager(mockRouter);

          // Action
          await navigationManager.initialize();

          // Assertions
          expect(navigateMock).toHaveBeenCalledWith('/login');
          expect(navigateMock).toHaveBeenCalledTimes(1);

          // Cleanup
          jest.clearAllMocks();
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Feature: ui, Property 9, 26: Показ Dashboard после успешной авторизации
     Preconditions: user authorized, currently on login screen
     Action: call initialize()
     Assertions: always redirects to dashboard
     Requirements: navigation.1.3 */
  it('should always redirect to dashboard when authorized and on login screen', async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (authorizedValue) => {
        // Only test when authorized is true
        if (!authorizedValue) return;

        // Setup
        mockGetStatus.mockResolvedValue({ authorized: true });
        const navigateMock = jest.fn();
        const mockRouter: Router = {
          navigate: navigateMock,
          currentRoute: '/login',
        };
        const navigationManager = new NavigationManager(mockRouter);

        // Action
        await navigationManager.initialize();

        // Assertions
        expect(navigateMock).toHaveBeenCalledWith('/dashboard');
        expect(navigateMock).toHaveBeenCalledTimes(1);

        // Cleanup
        jest.clearAllMocks();
      }),
      { numRuns: 100 }
    );
  });

  /* Feature: ui, Property 8, 24: Показ экрана логина для неавторизованных пользователей
     Preconditions: various auth states
     Action: call checkAuthStatus()
     Assertions: returns correct boolean based on auth state
     Requirements: navigation.1.1 */
  it('should correctly check auth status for any auth state', async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (isAuthorized) => {
        // Setup
        mockGetStatus.mockResolvedValue({ authorized: isAuthorized });
        const mockRouter: Router = {
          navigate: jest.fn(),
          currentRoute: '/dashboard',
        };
        const navigationManager = new NavigationManager(mockRouter);

        // Action
        const result = await navigationManager.checkAuthStatus();

        // Assertions
        expect(result).toBe(isAuthorized);
        expect(mockGetStatus).toHaveBeenCalledTimes(1);

        // Cleanup
        jest.clearAllMocks();
      }),
      { numRuns: 100 }
    );
  });

  /* Feature: ui, Property 27: Перенаправление на Login после logout
     Preconditions: various current routes
     Action: call redirectToLogin()
     Assertions: always navigates to /login
     Requirements: navigation.1.1, navigation.1.4 */
  it('should always redirect to login regardless of current route', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('/dashboard', '/settings', '/tasks', '/calendar', '/contacts', '/login'),
        (currentRoute) => {
          // Setup
          const navigateMock = jest.fn();
          const mockRouter: Router = {
            navigate: navigateMock,
            currentRoute: currentRoute,
          };
          const navigationManager = new NavigationManager(mockRouter);

          // Action
          navigationManager.redirectToLogin();

          // Assertions
          expect(navigateMock).toHaveBeenCalledWith('/login');
          expect(navigateMock).toHaveBeenCalledTimes(1);

          // Cleanup
          jest.clearAllMocks();
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Feature: ui, Property 26: Перенаправление на Dashboard после успешной авторизации
     Preconditions: various current routes
     Action: call redirectToDashboard()
     Assertions: always navigates to /dashboard
     Requirements: navigation.1.3 */
  it('should always redirect to dashboard regardless of current route', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('/dashboard', '/settings', '/tasks', '/calendar', '/contacts', '/login'),
        (currentRoute) => {
          // Setup
          const navigateMock = jest.fn();
          const mockRouter: Router = {
            navigate: navigateMock,
            currentRoute: currentRoute,
          };
          const navigationManager = new NavigationManager(mockRouter);

          // Action
          navigationManager.redirectToDashboard();

          // Assertions
          expect(navigateMock).toHaveBeenCalledWith('/dashboard');
          expect(navigateMock).toHaveBeenCalledTimes(1);

          // Cleanup
          jest.clearAllMocks();
        }
      ),
      { numRuns: 100 }
    );
  });

  /* Feature: ui, Property 8, 9: Navigation behavior based on auth status
     Preconditions: various combinations of auth status and current route
     Action: call initialize()
     Assertions: correct navigation based on auth status and route
     Requirements: navigation.1.1, navigation.1.3 */
  it('should handle all combinations of auth status and routes correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.constantFrom('/dashboard', '/settings', '/tasks', '/calendar', '/contacts', '/login'),
        async (isAuthorized, currentRoute) => {
          // Setup
          mockGetStatus.mockResolvedValue({ authorized: isAuthorized });
          const navigateMock = jest.fn();
          const mockRouter: Router = {
            navigate: navigateMock,
            currentRoute: currentRoute,
          };
          const navigationManager = new NavigationManager(mockRouter);

          // Action
          await navigationManager.initialize();

          // Assertions
          if (!isAuthorized) {
            // Property 8, 24: Not authorized -> always redirect to login
            expect(navigateMock).toHaveBeenCalledWith('/login');
            expect(navigateMock).toHaveBeenCalledTimes(1);
          } else if (currentRoute === '/login') {
            // Property 9, 26: Authorized and on login -> redirect to dashboard
            expect(navigateMock).toHaveBeenCalledWith('/dashboard');
            expect(navigateMock).toHaveBeenCalledTimes(1);
          } else {
            // Authorized and not on login -> no redirect
            expect(navigateMock).not.toHaveBeenCalled();
          }

          // Cleanup
          jest.clearAllMocks();
        }
      ),
      { numRuns: 100 }
    );
  });
});
