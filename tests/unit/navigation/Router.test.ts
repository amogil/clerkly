/* Preconditions: SimpleRouter created with initial route and callback
   Action: call navigate() with different routes
   Assertions: currentRoute updated, callback invoked with correct route
   Requirements: ui.8.1, ui.8.3, ui.8.4 */

import { SimpleRouter } from '../../../src/renderer/navigation/Router';

describe('SimpleRouter', () => {
  /* Preconditions: SimpleRouter created with initial route '/dashboard'
     Action: get currentRoute property
     Assertions: returns '/dashboard'
     Requirements: ui.8.1 */
  it('should return initial route', () => {
    const onNavigate = jest.fn();
    const router = new SimpleRouter('/dashboard', onNavigate);

    expect(router.currentRoute).toBe('/dashboard');
    expect(onNavigate).not.toHaveBeenCalled();
  });

  /* Preconditions: SimpleRouter created
     Action: call navigate('/login')
     Assertions: currentRoute updated to '/login', callback invoked with '/login'
     Requirements: ui.8.1, ui.8.4 */
  it('should navigate to login route', () => {
    const onNavigate = jest.fn();
    const router = new SimpleRouter('/dashboard', onNavigate);

    router.navigate('/login');

    expect(router.currentRoute).toBe('/login');
    expect(onNavigate).toHaveBeenCalledWith('/login');
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  /* Preconditions: SimpleRouter created
     Action: call navigate('/dashboard')
     Assertions: currentRoute updated to '/dashboard', callback invoked with '/dashboard'
     Requirements: ui.8.3 */
  it('should navigate to dashboard route', () => {
    const onNavigate = jest.fn();
    const router = new SimpleRouter('/login', onNavigate);

    router.navigate('/dashboard');

    expect(router.currentRoute).toBe('/dashboard');
    expect(onNavigate).toHaveBeenCalledWith('/dashboard');
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  /* Preconditions: SimpleRouter created
     Action: call navigate() multiple times with different routes
     Assertions: currentRoute always reflects last navigation, callback invoked for each navigation
     Requirements: ui.8.1, ui.8.3, ui.8.4 */
  it('should handle multiple navigations', () => {
    const onNavigate = jest.fn();
    const router = new SimpleRouter('/dashboard', onNavigate);

    router.navigate('/settings');
    expect(router.currentRoute).toBe('/settings');
    expect(onNavigate).toHaveBeenCalledWith('/settings');

    router.navigate('/tasks');
    expect(router.currentRoute).toBe('/tasks');
    expect(onNavigate).toHaveBeenCalledWith('/tasks');

    router.navigate('/login');
    expect(router.currentRoute).toBe('/login');
    expect(onNavigate).toHaveBeenCalledWith('/login');

    expect(onNavigate).toHaveBeenCalledTimes(3);
  });

  /* Preconditions: SimpleRouter created
     Action: call updateCurrentRoute() with new route
     Assertions: currentRoute updated, callback NOT invoked
     Requirements: ui.8.1 */
  it('should update current route without triggering callback', () => {
    const onNavigate = jest.fn();
    const router = new SimpleRouter('/dashboard', onNavigate);

    router.updateCurrentRoute('/settings');

    expect(router.currentRoute).toBe('/settings');
    expect(onNavigate).not.toHaveBeenCalled();
  });

  /* Preconditions: SimpleRouter created
     Action: call navigate() with same route multiple times
     Assertions: callback invoked each time, currentRoute remains same
     Requirements: ui.8.1 */
  it('should allow navigating to same route multiple times', () => {
    const onNavigate = jest.fn();
    const router = new SimpleRouter('/dashboard', onNavigate);

    router.navigate('/dashboard');
    router.navigate('/dashboard');

    expect(router.currentRoute).toBe('/dashboard');
    expect(onNavigate).toHaveBeenCalledWith('/dashboard');
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });
});
