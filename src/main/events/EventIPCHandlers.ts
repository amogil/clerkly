// Requirements: realtime-events.4.1, realtime-events.4.2
/**
 * IPC handlers for event communication between main and renderer processes
 */

import { ipcMain, IpcMainEvent } from 'electron';
import { MainEventBus } from './MainEventBus';
import { Logger } from '../Logger';
import { IPC_CHANNELS } from '../../shared/events/constants';
import { EventType, ClerklyEvents } from '../../shared/events/types';

const logger = Logger.create('EventIPCHandlers');

/**
 * Register IPC handlers for event system
 * Requirements: realtime-events.4.1
 */
export function registerEventIPCHandlers(): void {
  // Handle events from renderer process
  // Requirements: realtime-events.4.2
  ipcMain.on(
    IPC_CHANNELS.EVENT_FROM_RENDERER,
    (_event: IpcMainEvent, type: string, payload: unknown) => {
      logger.debug(`Received event from renderer: ${type}`);

      // Validate event type
      if (!type || typeof type !== 'string') {
        logger.error('Received malformed event: missing or invalid type');
        return;
      }

      // Validate payload
      if (!payload || typeof payload !== 'object') {
        logger.error(`Received malformed event: missing or invalid payload for ${type}`);
        return;
      }

      // Validate timestamp
      const payloadObj = payload as { timestamp?: number };
      if (typeof payloadObj.timestamp !== 'number') {
        logger.error(`Received malformed event: missing timestamp for ${type}`);
        return;
      }

      try {
        const eventBus = MainEventBus.getInstance();
        // Deliver locally only (event came from renderer, don't send back)
        // Requirements: realtime-events.4.3
        eventBus.deliverFromIPC(type as EventType, payload as ClerklyEvents[EventType]);
      } catch (error) {
        logger.error(`Error processing event from renderer: ${error}`);
      }
    }
  );

  logger.debug('Event IPC handlers registered');
}
