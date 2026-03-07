// Requirements: agents.13.2, navigation.1.1, navigation.1.3

import { Logger } from '../Logger';
import { MainEventBus } from '../events/MainEventBus';
import { OAuthClientManager } from '../auth/OAuthClientManager';
import { EVENT_TYPES } from '../../shared/events/constants';
import type {
  AppCoordinatorState,
  AuthCompletedPayload,
  AuthFailedPayload,
  AuthSignedOutPayload,
  UserProfileUpdatedPayload,
} from '../../shared/events/types';

interface AppCoordinatorOptions {
  chatsReadyTimeoutMs?: number;
}

// Requirements: agents.13.2, navigation.1.1, navigation.1.3
export class AppCoordinator {
  private readonly logger = Logger.create('AppCoordinator');
  private readonly eventBus: MainEventBus;
  private readonly oauthClient: OAuthClientManager;
  private readonly chatsReadyTimeoutMs: number;

  private started = false;
  private unsubscribes: Array<() => void> = [];
  private chatsReadyTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private state: AppCoordinatorState = {
    phase: 'booting',
    authorized: false,
    targetScreen: 'login',
  };

  constructor(
    oauthClient: OAuthClientManager,
    options?: AppCoordinatorOptions,
    eventBus: MainEventBus = MainEventBus.getInstance()
  ) {
    this.oauthClient = oauthClient;
    this.eventBus = eventBus;
    this.chatsReadyTimeoutMs = options?.chatsReadyTimeoutMs ?? 15000;
  }

  // Requirements: navigation.1.1, navigation.1.3
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.subscribeEvents();

    this.transition({
      phase: 'booting',
      authorized: false,
      targetScreen: 'login',
      reason: 'startup',
    });

    try {
      const authStatus = await this.oauthClient.getAuthStatus();
      if (!authStatus.authorized) {
        this.clearChatsReadyTimeout();
        this.transition({
          phase: 'unauthenticated',
          authorized: false,
          targetScreen: 'login',
          reason: authStatus.error || 'not_authorized',
        });
        return;
      }

      this.transition({
        phase: 'preparing-session',
        authorized: true,
        targetScreen: 'agents',
        reason: 'authorized_on_startup',
      });
      this.transitionToWaitingForChats('startup_authorized');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.clearChatsReadyTimeout();
      this.transition({
        phase: 'error',
        authorized: false,
        targetScreen: 'login',
        reason: `startup_auth_status_failed:${message}`,
      });
    }
  }

  // Requirements: realtime-events.1.6
  stop(): void {
    this.clearChatsReadyTimeout();
    this.unsubscribes.forEach((unsubscribe) => unsubscribe());
    this.unsubscribes = [];
    this.started = false;
  }

  // Requirements: agents.13.2
  getState(): AppCoordinatorState {
    return { ...this.state };
  }

  // Requirements: agents.13.14
  markChatsReady(source: 'renderer' = 'renderer'): void {
    if (!this.started) return;
    if (!this.state.authorized) return;
    this.clearChatsReadyTimeout();
    this.transition({
      phase: 'ready',
      authorized: true,
      targetScreen: 'agents',
      reason: `chats_ready_${source}`,
    });
  }

  // Requirements: realtime-events.1.3
  private subscribeEvents(): void {
    this.unsubscribes.push(
      this.eventBus.subscribe(EVENT_TYPES.AUTH_COMPLETED, (payload: AuthCompletedPayload) =>
        this.handleAuthCompleted(payload)
      )
    );
    this.unsubscribes.push(
      this.eventBus.subscribe(EVENT_TYPES.AUTH_FAILED, (payload: AuthFailedPayload) =>
        this.handleAuthFailed(payload)
      )
    );
    this.unsubscribes.push(
      this.eventBus.subscribe(EVENT_TYPES.AUTH_SIGNED_OUT, (payload: AuthSignedOutPayload) =>
        this.handleAuthSignedOut(payload)
      )
    );
    this.unsubscribes.push(
      this.eventBus.subscribe(
        EVENT_TYPES.USER_PROFILE_UPDATED,
        (payload: UserProfileUpdatedPayload) => this.handleUserProfileUpdated(payload)
      )
    );
  }

  private handleAuthCompleted(_payload: AuthCompletedPayload): void {
    // If app is already ready, do not re-enter startup loading.
    // This can happen when OAuth is re-run in tests while session is already active.
    if (this.state.phase === 'ready' && this.state.authorized) {
      this.transition({
        phase: 'ready',
        authorized: true,
        targetScreen: 'agents',
        reason: 'auth_completed_while_ready',
      });
      return;
    }

    this.transition({
      phase: 'preparing-session',
      authorized: true,
      targetScreen: 'agents',
      reason: 'auth_completed',
    });
    this.transitionToWaitingForChats('auth_completed');
  }

  private handleAuthFailed(payload: AuthFailedPayload): void {
    this.clearChatsReadyTimeout();
    this.transition({
      phase: 'unauthenticated',
      authorized: false,
      targetScreen: 'login',
      reason: `auth_failed:${payload.code}:${payload.message}`,
    });
  }

  private handleAuthSignedOut(_payload: AuthSignedOutPayload): void {
    this.clearChatsReadyTimeout();
    this.transition({
      phase: 'unauthenticated',
      authorized: false,
      targetScreen: 'login',
      reason: 'signed_out',
    });
  }

  private handleUserProfileUpdated(_payload: UserProfileUpdatedPayload): void {
    if (!this.state.authorized) return;
    if (this.state.phase === 'preparing-session') {
      this.transitionToWaitingForChats('profile_updated');
    }
  }

  private transitionToWaitingForChats(reason: string): void {
    this.transition({
      phase: 'waiting-for-chats',
      authorized: true,
      targetScreen: 'agents',
      reason,
    });
    this.startChatsReadyTimeout();
  }

  private startChatsReadyTimeout(): void {
    this.clearChatsReadyTimeout();
    this.chatsReadyTimeoutId = setTimeout(() => {
      this.transition({
        phase: 'error',
        authorized: true,
        targetScreen: 'agents',
        reason: `chats_ready_timeout_${this.chatsReadyTimeoutMs}ms`,
      });
    }, this.chatsReadyTimeoutMs);

    // Do not keep Node/Jest process alive solely because of this watchdog timer.
    if (typeof (this.chatsReadyTimeoutId as { unref?: () => void }).unref === 'function') {
      (this.chatsReadyTimeoutId as { unref: () => void }).unref();
    }
  }

  private clearChatsReadyTimeout(): void {
    if (this.chatsReadyTimeoutId) {
      clearTimeout(this.chatsReadyTimeoutId);
      this.chatsReadyTimeoutId = null;
    }
  }

  private transition(next: AppCoordinatorState): void {
    const prev = this.state;
    const hasChanged =
      prev.phase !== next.phase ||
      prev.authorized !== next.authorized ||
      prev.targetScreen !== next.targetScreen ||
      prev.reason !== next.reason;
    if (!hasChanged) return;

    this.state = next;
    this.logger.info(
      `state ${prev.phase}/${prev.targetScreen} -> ${next.phase}/${next.targetScreen} (${next.reason || 'no_reason'})`
    );
  }
}
