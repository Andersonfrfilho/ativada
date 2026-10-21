// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { LIVE_STALL_MUTANT_TARGET } from './fixtures/api-routes/api-routes-mutation.fixture.js';
import {
  removeMutantCopies,
  runSourceMutant,
  type MutantVerdict,
  type SourceEdit,
  type SourceMutant,
} from './fixtures/walk-forward/walk-forward-mutation.fixture.js';

const MUTANT_TIMEOUT_MILLISECONDS = 900_000;
const PARALLEL_MUTANTS = 4;
const CONTROL: SourceMutant = { name: 'CONTROL', edits: [] };
const POLICY = 'runs/stall/stall-policy.ts';
const SWEEPER = 'runs/stall/stall-sweeper.ts';
const LOOP = 'runs/stall/stall-sweep-loop.ts';
const PAYLOAD = 'runs/stall/stall-alert-payload.ts';
const GRACE_EXPRESSION = 'params.graceMinutes * MILLISECONDS_PER_MINUTE';
const LOCK_LINE = 'if (!(await session.tryAcquireLock())) return NOT_ACQUIRED;';
const KEEP_LINE = "if (dueSince !== undefined || candidate.isWaitingForData) return 'unchanged';";

function edit(file: string, find: string, replace: string): SourceEdit[] {
  return [{ file, find, replace, occurrences: 1 }];
}

const POLICY_MUTANTS: readonly SourceMutant[] = [
  { name: 'GRACE_IGNORED', edits: edit(POLICY, GRACE_EXPRESSION, '0') },
  {
    name: 'GRACE_DOUBLED',
    edits: edit(POLICY, GRACE_EXPRESSION, 'params.graceMinutes * 2 * MILLISECONDS_PER_MINUTE'),
  },
  {
    name: 'GRACE_BOUNDARY_EXCLUSIVE',
    edits: edit(POLICY, 'params.now >= stalledSince', 'params.now > stalledSince'),
  },
  {
    name: 'DUE_AT_THE_OPEN_OF_THE_CANDLE_NOT_ITS_CLOSE',
    edits: edit(POLICY, 'return nextOpenTime + duration;', 'return nextOpenTime;'),
  },
  {
    name: 'NEXT_CANDLE_IS_THE_LAST_ONE_AGAIN',
    edits: edit(POLICY, ': params.lastCandleTime + duration;', ': params.lastCandleTime;'),
  },
  {
    name: 'FIRST_CANDLE_IGNORES_THE_GRID',
    edits: edit(POLICY, 'Math.floor(params.startedAt / duration) * duration', 'params.startedAt'),
  },
  {
    name: 'WAITING_FOR_DATA_COUNTS_AS_STALLED',
    edits: edit(POLICY, 'if (params.waitingForData) return undefined;\n', ''),
  },
  {
    name: 'STALLED_SINCE_IS_THE_SWEEP_INSTANT',
    edits: edit(
      POLICY,
      'return params.now >= stalledSince ? stalledSince : undefined;',
      'return params.now >= stalledSince ? params.now : undefined;',
    ),
  },
];

const SWEEPER_MUTANTS: readonly SourceMutant[] = [
  { name: 'SWEEP_WITHOUT_THE_ADVISORY_LOCK', edits: edit(SWEEPER, LOCK_LINE, '') },
  {
    name: 'SWEEP_IGNORES_THE_LOCK_ANSWER',
    edits: edit(SWEEPER, LOCK_LINE, 'await session.tryAcquireLock();'),
  },
  {
    name: 'EPISODE_START_MOVES_WITH_THE_SWEEP',
    edits: edit(
      SWEEPER,
      'stalledSince: dueSince,\n      alertPayload,',
      'stalledSince: params.now,\n      alertPayload,',
    ),
  },
  {
    name: 'PARTIAL_RECOVERY_CLOSES_AND_REOPENS_THE_EPISODE',
    edits: edit(
      SWEEPER,
      KEEP_LINE,
      "if (dueSince === openSince || candidate.isWaitingForData) return 'unchanged';",
    ),
  },
  {
    name: 'WAITING_FOR_DATA_CLOSES_THE_EPISODE',
    edits: edit(SWEEPER, KEEP_LINE, "if (dueSince !== undefined) return 'unchanged';"),
  },
  { name: 'OPEN_EPISODE_NEVER_CLOSES', edits: edit(SWEEPER, KEEP_LINE, "return 'unchanged';") },
  {
    name: 'STOPPED_RUNS_KEEP_THE_EPISODE_MARK',
    edits: edit(
      SWEEPER,
      'const cleared = await session.clearInactiveEpisodes();',
      'const cleared = 0;',
    ),
  },
  {
    name: 'RESUME_PAYLOAD_WITHOUT_THE_EPISODE_START',
    edits: edit(
      SWEEPER,
      'stalledSince: openSince,\n    resumedAt: params.now,',
      'stalledSince: params.now,\n    resumedAt: params.now,',
    ),
  },
];

const PAYLOAD_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'STALL_PAYLOAD_LEAKS_THE_RUN_ID',
    edits: edit(
      PAYLOAD,
      'return { symbol: candidate.symbol, timeframe: candidate.timeframe, stalledSince };',
      'return {\n    symbol: candidate.symbol,\n    timeframe: candidate.timeframe,\n    stalledSince,\n    runId: candidate.runId,\n  };',
    ),
  },
  {
    name: 'RESUME_PAYLOAD_LEAKS_THE_RUN_ID',
    edits: edit(
      PAYLOAD,
      'return { symbol: candidate.symbol, timeframe: candidate.timeframe, stalledSince, resumedAt };',
      'return {\n    symbol: candidate.symbol,\n    timeframe: candidate.timeframe,\n    stalledSince,\n    resumedAt,\n    runId: candidate.runId,\n  };',
    ),
  },
  {
    name: 'STALL_PAYLOAD_WITHOUT_THE_PAIR',
    edits: edit(
      PAYLOAD,
      'return { symbol: candidate.symbol, timeframe: candidate.timeframe, stalledSince };',
      'return { timeframe: candidate.timeframe, stalledSince } as never;',
    ),
  },
];

const LOOP_MUTANTS: readonly SourceMutant[] = [
  {
    name: 'LOOP_IGNORES_THE_DATABASE_WAIT',
    edits: edit(LOOP, '  if (outage.isWaiting()) return;\n', ''),
  },
  {
    name: 'LOOP_LOGS_EVERY_ROUND',
    edits: edit(LOOP, 'if (summary.opened + summary.closed > 0) {', 'if (true) {'),
  },
  {
    name: 'LOOP_LOGS_THE_RAW_ERROR_MESSAGE',
    edits: edit(
      LOOP,
      '{ errorName: readErrorName(error) }',
      '{ errorName: readErrorName(error), message: String(error) }',
    ),
  },
];

const MUTANTS: readonly SourceMutant[] = [
  ...POLICY_MUTANTS,
  ...SWEEPER_MUTANTS,
  ...PAYLOAD_MUTANTS,
  ...LOOP_MUTANTS,
];

describe('parada da simulação ao vivo: o contrato reprova cada mutante do código de produção', () => {
  const verdicts = new Map<string, MutantVerdict>();

  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runSourceMutant(LIVE_STALL_MUTANT_TARGET, next));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(() => removeMutantCopies(LIVE_STALL_MUTANT_TARGET));

  test('a cópia sem edição passa nos mesmos testes: o arnês é sólido', () => {
    expect(verdicts.get(CONTROL.name)).toStrictEqual({
      exitCode: 0,
      failedTests: 0,
      hasLoadError: false,
    });
  });

  test.each(MUTANTS.map((mutant) => [mutant.name, mutant] as const))('%s', (_name, mutant) => {
    const verdict = verdicts.get(mutant.name);
    expect(verdict?.hasLoadError).toBe(false);
    expect(verdict?.exitCode).not.toBe(0);
    expect(verdict?.failedTests ?? 0).toBeGreaterThan(0);
  });

  test('os nomes são distintos', () => {
    expect(new Set(MUTANTS.map((mutant) => mutant.name)).size).toBe(MUTANTS.length);
  });
});
