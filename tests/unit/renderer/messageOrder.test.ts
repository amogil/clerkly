// Requirements: llm-integration.11.1.5, agents.7.4.8

import type { MessageSnapshot } from '../../../src/shared/events/types';
import {
  compareMessageSnapshots,
  sortMessageSnapshots,
} from '../../../src/renderer/lib/messageOrder';

function makeSnapshot(
  id: number,
  timestamp: number,
  order?: { runId: string; attemptId: number; sequence: number }
): MessageSnapshot {
  return {
    id,
    agentId: 'agent-1',
    kind: 'llm',
    timestamp,
    payload: { data: { text: `m-${id}`, order } },
    replyToMessageId: null,
    hidden: false,
    done: true,
  };
}

describe('messageOrder', () => {
  /* Preconditions: same run/attempt with out-of-order sequence
     Action: sort snapshots
     Assertions: sorted by sequence regardless of insertion order
     Requirements: llm-integration.11.1.5, agents.7.4.8 */
  it('sorts by sequence within the same run and attempt', () => {
    const m3 = makeSnapshot(3, 1003, { runId: 'run-a', attemptId: 1, sequence: 3 });
    const m1 = makeSnapshot(1, 1001, { runId: 'run-a', attemptId: 1, sequence: 1 });
    const m2 = makeSnapshot(2, 1002, { runId: 'run-a', attemptId: 1, sequence: 2 });

    const sorted = sortMessageSnapshots([m3, m1, m2]);

    expect(sorted.map((m) => m.id)).toEqual([1, 2, 3]);
  });

  /* Preconditions: snapshots without comparable order metadata
     Action: compare snapshots
     Assertions: comparator falls back to timestamp then id
     Requirements: llm-integration.11.1.5 */
  it('falls back to timestamp and id when order metadata is not comparable', () => {
    const a = makeSnapshot(2, 1000, { runId: 'run-a', attemptId: 1, sequence: 2 });
    const b = makeSnapshot(1, 1000, { runId: 'run-b', attemptId: 1, sequence: 1 });

    expect(compareMessageSnapshots(a, b)).toBeGreaterThan(0);
    expect(sortMessageSnapshots([a, b]).map((m) => m.id)).toEqual([1, 2]);
  });

  /* Preconditions: same runId but different attempts arrive out of order by timestamp
     Action: sort snapshots
     Assertions: attemptId order is respected before timestamp fallback
     Requirements: llm-integration.11.1.5, agents.7.4.8 */
  it('sorts by attemptId for same run before fallback timestamp/id', () => {
    const attempt2 = makeSnapshot(20, 1000, { runId: 'run-a', attemptId: 2, sequence: 1 });
    const attempt1 = makeSnapshot(10, 2000, { runId: 'run-a', attemptId: 1, sequence: 99 });

    const sorted = sortMessageSnapshots([attempt2, attempt1]);

    expect(sorted.map((m) => m.id)).toEqual([10, 20]);
  });
});
