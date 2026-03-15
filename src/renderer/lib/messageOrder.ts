// Requirements: llm-integration.11.1.5, agents.7.4.8

import type { MessageSnapshot } from '../../shared/events/types';

function readOrder(message: MessageSnapshot): {
  runId: string;
  attemptId: number;
  sequence: number;
} | null {
  if (typeof message.runId !== 'string') return null;
  if (typeof message.attemptId !== 'number') return null;
  if (typeof message.sequence !== 'number') return null;
  return {
    runId: message.runId,
    attemptId: message.attemptId,
    sequence: message.sequence,
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
