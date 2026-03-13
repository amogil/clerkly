// Requirements: llm-integration.11.1.5, agents.7.4.8

import type { MessageSnapshot } from '../../shared/events/types';

type MessageOrderMeta = {
  runId?: unknown;
  attemptId?: unknown;
  sequence?: unknown;
};

function readOrder(message: MessageSnapshot): {
  runId: string;
  attemptId: number;
  sequence: number;
} | null {
  const data = (message.payload?.data ?? {}) as { order?: MessageOrderMeta };
  const order = data.order;
  if (!order || typeof order !== 'object') return null;
  if (typeof order.runId !== 'string') return null;
  if (typeof order.attemptId !== 'number') return null;
  if (typeof order.sequence !== 'number') return null;
  return {
    runId: order.runId,
    attemptId: order.attemptId,
    sequence: order.sequence,
  };
}

function compareByTimestampAndId(a: MessageSnapshot, b: MessageSnapshot): number {
  if (a.timestamp !== b.timestamp) {
    return a.timestamp - b.timestamp;
  }
  return a.id - b.id;
}

export function compareMessageSnapshots(a: MessageSnapshot, b: MessageSnapshot): number {
  const ao = readOrder(a);
  const bo = readOrder(b);

  if (ao && bo && ao.runId === bo.runId) {
    if (ao.attemptId !== bo.attemptId) {
      return ao.attemptId - bo.attemptId;
    }
    if (ao.sequence !== bo.sequence) {
      return ao.sequence - bo.sequence;
    }
  }

  return compareByTimestampAndId(a, b);
}

export function sortMessageSnapshots(messages: MessageSnapshot[]): MessageSnapshot[] {
  return [...messages].sort(compareMessageSnapshots);
}
