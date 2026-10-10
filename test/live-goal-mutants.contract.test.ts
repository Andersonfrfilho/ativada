// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  LIVE_RECORDING_COPY,
  removeLiveMutants,
  runLiveMutant,
  type LiveMutantVerdict,
  type LiveSourceEdit,
  type LiveSourceMutant,
} from './fixtures/live/live-mutation.fixture.js';

const MUTANT_TIMEOUT_MILLISECONDS = 900_000;
const PARALLEL_MUTANTS = 4;
const CONTROL: LiveSourceMutant = { name: 'CONTROL', edits: [] };
const STEP = 'goal-step.ts';
const ALERT = 'goal-alert.ts';
const LIVE_STEP = 'live-step.ts';
const ADVANCE = `${LIVE_RECORDING_COPY}/advance-candle.ts`;

function edit(file: string, find: string, replace: string, occurrences = 1): LiveSourceEdit[] {
  return [{ file, find, replace, occurrences }];
}

const MUTANTS: readonly LiveSourceMutant[] = [
  {
    name: 'GOAL_IGNORED_BY_THE_STEP',
    edits: edit(
      LIVE_STEP,
      'if (goal === undefined || goal.isOutcomeRecorded) return { result: first, decision: undefined };',
      'if (true as boolean) return { result: first, decision: undefined };',
    ),
  },
  {
    name: 'OUTCOME_JUDGED_AGAIN_AFTER_IT_WAS_RECORDED',
    edits: edit(
      LIVE_STEP,
      'if (goal === undefined || goal.isOutcomeRecorded) return',
      'if (goal === undefined) return',
    ),
  },
  {
    name: 'EXIT_COMMANDS_NOT_APPLIED',
    edits: edit(
      LIVE_STEP,
      'return { result: advance(run, { cursor, candle, commands }), decision };',
      'return { result: first, decision };',
    ),
  },
  {
    name: 'RUN_COMPLETES_BEFORE_THE_POSITION_EXITS',
    edits: edit(
      LIVE_STEP,
      'shouldComplete: isEnding && isWalletSettled(result.state),',
      'shouldComplete: isEnding,',
    ),
  },
  {
    name: 'RUN_NEVER_COMPLETES',
    edits: edit(
      LIVE_STEP,
      'shouldComplete: isEnding && isWalletSettled(result.state),',
      'shouldComplete: false,',
    ),
  },
  {
    name: 'RUN_COMPLETES_BEFORE_THE_OUTCOME',
    edits: edit(
      LIVE_STEP,
      'const isEnding = decision !== undefined || goal.isOutcomeRecorded;',
      'const isEnding = true;',
    ),
  },
  {
    name: 'OUTCOME_CANDLE_IS_THE_CLOSE_TIME',
    edits: edit(
      LIVE_STEP,
      'candleTime: params.candle.openTime }',
      'candleTime: params.candle.closeTime }',
    ),
  },
  {
    name: 'OUTCOME_NEVER_MARKED_AS_RECORDED',
    edits: edit(LIVE_STEP, '    run.goal.isOutcomeRecorded = true;\n', ''),
  },
  {
    name: 'GOAL_ALERT_EVEN_WITH_ALERTS_OFF',
    edits: edit(LIVE_STEP, ' || run.alerting === undefined', ''),
  },
  {
    name: 'GOAL_ALERT_NEVER_ENQUEUED',
    edits: edit(LIVE_STEP, 'return [...signalAlerts, goalAlert];', 'return signalAlerts;'),
  },
  {
    name: 'RUNS_WITHOUT_GOAL_ARE_TRACKED',
    edits: edit(STEP, 'if (run.goalId === undefined) return undefined;', ''),
  },
  {
    name: 'GOAL_SNAPSHOT_NOT_VALIDATED',
    edits: edit(
      STEP,
      'spec = parseGoalSpec(readGoalSnapshot(run.request));',
      'spec = readGoalSnapshot(run.request) as GoalSpec;',
    ),
  },
  {
    name: 'HORIZON_COUNTED_IN_DAYS',
    edits: edit(
      STEP,
      '(spec.horizonDays * MILLISECONDS_PER_DAY) / durationMilliseconds',
      'spec.horizonDays',
    ),
  },
  {
    name: 'LEVELS_FROM_A_WRONG_BALANCE',
    edits: edit(
      STEP,
      'initial: toEngineDecimal(setup.parameters.initialBalance),',
      "initial: toEngineDecimal('1'),",
    ),
  },
  {
    name: 'CANDLES_COUNTED_FROM_ZERO',
    edits: edit(STEP, '/ tracking.durationMilliseconds + 1;', '/ tracking.durationMilliseconds;'),
  },
  {
    name: 'WARM_UP_CANDLES_ARE_JUDGED',
    edits: edit(
      STEP,
      'if (candlesElapsed < 1 || equityPoint === null) return undefined;',
      'if (candlesElapsed < 0 || equityPoint === null) return undefined;',
    ),
  },
  {
    name: 'STOPPED_VALUE_IS_THE_CLOSE',
    edits: edit(
      STEP,
      'finalValue: formatEngineDecimal(goalFinalValue(outcome, point)),',
      'finalValue: formatEngineDecimal(point.equity),',
    ),
  },
  {
    name: 'RUN_OUTCOME_MAP_SWAPPED',
    edits: edit(
      STEP,
      '[GOAL_OUTCOME.REACHED]: GOAL_RUN_OUTCOME.REACHED,',
      '[GOAL_OUTCOME.REACHED]: GOAL_RUN_OUTCOME.STOPPED,',
    ),
  },
  {
    name: 'COMMAND_REASON_MAP_SWAPPED',
    edits: edit(
      STEP,
      '[GOAL_OUTCOME.STOPPED]: COMMAND_REASON.GOAL_MAX_LOSS,',
      '[GOAL_OUTCOME.STOPPED]: COMMAND_REASON.GOAL_EXPIRED,',
    ),
  },
  {
    name: 'ONLY_THE_EXIT_COMMAND',
    edits: edit(
      STEP,
      '[COMMAND_KIND.EXIT_POSITION, COMMAND_KIND.HALT].map',
      '[COMMAND_KIND.EXIT_POSITION].map',
    ),
  },
  {
    name: 'COMMAND_ISSUED_AT_THE_OPEN',
    edits: edit(STEP, 'issuedAt: candle.closeTime,', 'issuedAt: candle.openTime,'),
  },
  {
    name: 'COMMAND_ID_WITHOUT_THE_RUN',
    edits: edit(
      STEP,
      'commandId: `goal:${runId}:${outcome}:${kind}`',
      'commandId: `goal:${outcome}:${kind}`',
    ),
  },
  {
    name: 'SETTLED_IGNORES_THE_PENDING_ORDER',
    edits: edit(
      STEP,
      'return state.wallet.position === null && state.wallet.pendingOrder === null;',
      'return state.wallet.position === null;',
    ),
  },
  {
    name: 'SETTLED_IGNORES_THE_POSITION',
    edits: edit(
      STEP,
      'return state.wallet.position === null && state.wallet.pendingOrder === null;',
      'return state.wallet.pendingOrder === null;',
    ),
  },
  {
    name: 'GOAL_RESULT_ROUNDED_HALF_UP',
    edits: edit(ALERT, 'EngineDecimal.ROUND_FLOOR', 'EngineDecimal.ROUND_HALF_UP'),
  },
  {
    name: 'GOAL_RESULT_NOT_RELATIVE',
    edits: edit(ALERT, '    .dividedBy(initial)\n', ''),
  },
  {
    name: 'GOAL_ALERT_ON_THE_CLOSE_TIME',
    edits: edit(ALERT, 'candleTime: candle.openTime,', 'candleTime: candle.closeTime,'),
  },
  {
    name: 'GOAL_ALERT_AS_A_SIGNAL_SIDE',
    edits: edit(ALERT, 'side: ALERT_SIDE.GOAL,', 'side: ALERT_SIDE.BUY,'),
  },
  {
    name: 'COMMANDS_DROPPED_BY_THE_CANDLE_STEP',
    edits: edit(ADVANCE, '    commands: params.commands,\n', ''),
  },
];

describe('mutantes da simulação ao vivo atrelada a uma meta', () => {
  const verdicts = new Map<string, LiveMutantVerdict>();

  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runLiveMutant(next));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(removeLiveMutants);

  test('the control copy (no edit) passes the same tests: the harness is sound', () => {
    expect(verdicts.get(CONTROL.name)).toStrictEqual({
      exitCode: 0,
      failedTests: 0,
      hasLoadError: false,
    });
  });

  test.each(MUTANTS.map((mutant) => [mutant.name, mutant] as const))('%s', (_name, mutant) => {
    const verdict = verdicts.get(mutant.name);
    expect(verdict?.problem).toBeUndefined();
    expect(verdict?.hasLoadError).toBe(false);
    expect(verdict?.exitCode).not.toBe(0);
    expect(verdict?.failedTests ?? 0).toBeGreaterThan(0);
  });

  test('os nomes são distintos', () => {
    expect(new Set(MUTANTS.map((mutant) => mutant.name)).size).toBe(MUTANTS.length);
  });
});
