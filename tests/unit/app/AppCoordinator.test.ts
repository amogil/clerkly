/**
 * @jest-environment node
 */

/* Preconditions: AppCoordinator created with mocked auth and event bus
   Action: start lifecycle and emit startup/auth/chats events
   Assertions: coordinator transitions through expected phases
   Requirements: agents.13.2, navigation.1.1, navigation.1.3 */

import { AppCoordinator } from '../../../src/main/app/AppCoordinator';
import { EVENT_TYPES } from '../../../src/shared/events/constants';
import type { EventType } from '../../../src/shared/events/types';

type Handler = (payload: any) => void;

class FakeMainEventBus {
  private handlers = new Map<string, Handler[]>();
  public published: Array<{ type: string; payload: any }> = [];

  subscribe(type: string, handler: Handler): () => void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
    return () => {
      const current = this.handlers.get(type) ?? [];
      this.handlers.set(
        type,
        current.filter((h) => h !== handler)
      );
    };
  }

  publish(event: { type: EventType; toPayload: () => any }): void {
    this.published.push({ type: event.type, payload: event.toPayload() });
    const listeners = this.handlers.get(event.type) ?? [];
    listeners.forEach((handler) => handler(event.toPayload()));
  }

  emit(type: string, payload: any): void {
    const listeners = this.handlers.get(type) ?? [];
    listeners.forEach((handler) => handler(payload));
  }
}

describe('AppCoordinator', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  /* Preconditions: auth status returns authorized: false
     Action: call start()
     Assertions: state transitions to unauthenticated/login
     Requirements: navigation.1.1 */
  it('should go to unauthenticated state when startup auth is missing', async () => {
    const eventBus = new FakeMainEventBus();
    const oauthClient = {
      getAuthStatus: jest.fn().mockResolvedValue({ authorized: false }),
    };
    const coordinator = new AppCoordinator(oauthClient as any, undefined, eventBus as any);

    await coordinator.start();

    expect(coordinator.getState()).toMatchObject({
      phase: 'unauthenticated',
      authorized: false,
      targetScreen: 'login',
    });
    expect(
      eventBus.published.some((event) => event.type === EVENT_TYPES.APP_COORDINATOR_STATE_CHANGED)
    ).toBe(true);
  });

  /* Preconditions: app coordinator transitions state in main process
     Action: start coordinator for authorized startup and mark chats ready
     Assertions: app.coordinator.state-changed events carry latest state snapshots
     Requirements: agents.13.17 */
  it('should publish app coordinator state-changed events on transitions', async () => {
    const eventBus = new FakeMainEventBus();
    const oauthClient = {
      getAuthStatus: jest.fn().mockResolvedValue({ authorized: true }),
    };
    const coordinator = new AppCoordinator(oauthClient as any, undefined, eventBus as any);

    await coordinator.start();
    coordinator.markChatsReady();

    const stateEvents = eventBus.published.filter(
      (event) => event.type === EVENT_TYPES.APP_COORDINATOR_STATE_CHANGED
    );

    expect(stateEvents.length).toBeGreaterThan(0);
    expect(stateEvents[stateEvents.length - 1]?.payload.state).toMatchObject({
      phase: 'ready',
      authorized: true,
      targetScreen: 'agents',
    });
  });

  /* Preconditions: app reached ready state and auth.completed is emitted again
     Action: emit auth.completed after chats are ready
     Assertions: coordinator keeps ready state and does not re-enter waiting phase
     Requirements: agents.13.2, navigation.1.3 */
  it('should keep ready state on repeated auth.completed', async () => {
    const eventBus = new FakeMainEventBus();
    const oauthClient = {
      getAuthStatus: jest.fn().mockResolvedValue({ authorized: true }),
    };
    const coordinator = new AppCoordinator(
      oauthClient as any,
      { chatsReadyTimeoutMs: 5000 },
      eventBus as any
    );

    await coordinator.start();
    coordinator.markChatsReady();

    expect(coordinator.getState().phase).toBe('ready');

    eventBus.emit(EVENT_TYPES.AUTH_COMPLETED, {
      userId: 'user-1',
      profile: { id: 'user-1', email: 'user@example.com', name: 'User' },
      timestamp: Date.now(),
    });

    expect(coordinator.getState()).toMatchObject({
      phase: 'ready',
      authorized: true,
      targetScreen: 'agents',
    });
  });

  /* Preconditions: startup auth is authorized and chats never become ready
     Action: run coordinator with short chats timeout and advance timers
     Assertions: coordinator transitions to error state
     Requirements: agents.13.2 */
  it('should transition to error when chats readiness timeout expires', async () => {
    jest.useFakeTimers();

    const eventBus = new FakeMainEventBus();
    const oauthClient = {
      getAuthStatus: jest.fn().mockResolvedValue({ authorized: true }),
    };
    const coordinator = new AppCoordinator(
      oauthClient as any,
      { chatsReadyTimeoutMs: 100 },
      eventBus as any
    );

    await coordinator.start();
    expect(coordinator.getState().phase).toBe('waiting-for-chats');

    jest.advanceTimersByTime(120);

    expect(coordinator.getState()).toMatchObject({
      phase: 'error',
      authorized: true,
      targetScreen: 'agents',
    });
  });

  /* Preconditions: auth status call throws error during startup
     Action: call start()
     Assertions: coordinator transitions to error/login state
     Requirements: agents.13.2, navigation.1.1 */
  it('should transition to error when startup auth check throws', async () => {
    const eventBus = new FakeMainEventBus();
    const oauthClient = {
      getAuthStatus: jest.fn().mockRejectedValue(new Error('boom')),
    };
    const coordinator = new AppCoordinator(oauthClient as any, undefined, eventBus as any);

    await coordinator.start();

    expect(coordinator.getState()).toMatchObject({
      phase: 'error',
      authorized: false,
      targetScreen: 'login',
    });
  });

  /* Preconditions: startup is authorized and waiting for chats
     Action: mark chats ready from renderer side
     Assertions: coordinator transitions to ready state
     Requirements: agents.13.2 */
  it('should transition to ready when chats loading completes', async () => {
    const eventBus = new FakeMainEventBus();
    const oauthClient = {
      getAuthStatus: jest.fn().mockResolvedValue({ authorized: true }),
    };
    const coordinator = new AppCoordinator(
      oauthClient as any,
      { chatsReadyTimeoutMs: 5000 },
      eventBus as any
    );

    await coordinator.start();
    expect(coordinator.getState().phase).toBe('waiting-for-chats');

    coordinator.markChatsReady();

    expect(coordinator.getState()).toMatchObject({
      phase: 'ready',
      authorized: true,
      targetScreen: 'agents',
    });
  });

  /* Preconditions: startup authorized and chats timeout is running
     Action: emit auth.failed before timeout, then advance timers
     Assertions: timeout is cleared and state remains unauthenticated
     Requirements: agents.13.2, navigation.1.1 */
  it('should clear chats timeout on auth.failed', async () => {
    jest.useFakeTimers();

    const eventBus = new FakeMainEventBus();
    const oauthClient = {
      getAuthStatus: jest.fn().mockResolvedValue({ authorized: true }),
    };
    const coordinator = new AppCoordinator(
      oauthClient as any,
      { chatsReadyTimeoutMs: 100 },
      eventBus as any
    );

    await coordinator.start();
    expect(coordinator.getState().phase).toBe('waiting-for-chats');

    eventBus.emit(EVENT_TYPES.AUTH_FAILED, {
      code: 'invalid_grant',
      message: 'Token expired',
      timestamp: Date.now(),
    });
    expect(coordinator.getState()).toMatchObject({
      phase: 'unauthenticated',
      authorized: false,
      targetScreen: 'login',
    });

    jest.advanceTimersByTime(200);

    expect(coordinator.getState()).toMatchObject({
      phase: 'unauthenticated',
      authorized: false,
      targetScreen: 'login',
    });
  });

  /* Preconditions: coordinator started and subscribed to bus
     Action: call stop(), then emit ready event and advance timers
     Assertions: state does not change after stop
     Requirements: agents.13.2 */
  it('should unsubscribe and stop reacting to events after stop()', async () => {
    jest.useFakeTimers();

    const eventBus = new FakeMainEventBus();
    const oauthClient = {
      getAuthStatus: jest.fn().mockResolvedValue({ authorized: true }),
    };
    const coordinator = new AppCoordinator(
      oauthClient as any,
      { chatsReadyTimeoutMs: 100 },
      eventBus as any
    );

    await coordinator.start();
    expect(coordinator.getState().phase).toBe('waiting-for-chats');

    coordinator.stop();

    coordinator.markChatsReady();
    jest.advanceTimersByTime(200);

    expect(coordinator.getState().phase).toBe('waiting-for-chats');
  });
});
