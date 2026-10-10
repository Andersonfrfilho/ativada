// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  removeBacktestMutants,
  runBacktestMutant,
  type BacktestMutantVerdict,
  type BacktestSourceEdit,
  type BacktestSourceMutant,
} from './fixtures/backtest/backtest-mutation.fixture.js';

const MUTANT_TIMEOUT_MILLISECONDS = 600_000;
const PARALLEL_MUTANTS = 4;
const CONTROL: BacktestSourceMutant = { name: 'CONTROL', edits: [] };
const LOOP = 'candle-loop.ts';
const FLUSH = 'flush-batch.ts';
const CONTEXT = 'load-backtest-context.ts';
const STREAM = 'candle-stream.ts';
const RESTORE = 'restore-checkpoint.ts';
const EXECUTE = 'execute-backtest.ts';

function edit(file: string, find: string, replace: string, occurrences = 1): BacktestSourceEdit[] {
  return [{ file, find, replace, occurrences }];
}

const MUTANTS: readonly BacktestSourceMutant[] = [
  {
    name: 'GAP_IGNORED',
    edits: edit(
      LOOP,
      'confirmedGapCandles: gap > 0 ? gap : undefined,',
      'confirmedGapCandles: undefined,',
    ),
  },
  {
    name: 'GAP_OFF_BY_ONE',
    edits: edit(
      LOOP,
      'confirmedGapCandles: gap > 0 ? gap : undefined,',
      'confirmedGapCandles: gap > 0 ? gap - 1 : undefined,',
    ),
  },
  {
    name: 'GAP_NOT_COUNTED',
    edits: edit(LOOP, 'state.gapCandles += gap;', ''),
  },
  {
    name: 'OPEN_CANDLE_ACCEPTED',
    edits: edit(
      CONTEXT,
      'periodEnd: Math.min(run.periodEnd ?? closedEdge, closedEdge),',
      'periodEnd: run.periodEnd ?? closedEdge,',
    ),
  },
  {
    name: 'CHECKPOINT_BEFORE_THE_BATCH',
    edits: [
      ...edit(FLUSH, '    await writer.appendResults(toRunResultRows(buffer));\n', ''),
      ...edit(
        FLUSH,
        "    return { kind: 'committed' };",
        "    await writer.appendResults(toRunResultRows(buffer));\n    return { kind: 'committed' };",
      ),
    ],
  },
  {
    name: 'BATCH_OUTSIDE_ONE_TRANSACTION',
    edits: edit(
      FLUSH,
      'if (!(await writer.saveCheckpoint(checkpoint))) {',
      'if ((await session.inBatch((second) => second.saveCheckpoint(checkpoint))) !== true) {',
    ),
  },
  {
    name: 'STATUS_NOT_CHECKED_BETWEEN_BATCHES',
    edits: edit(
      FLUSH,
      "if (status !== RUN_STATUS.RUNNING) return { kind: 'stopped', status };",
      '',
    ),
  },
  {
    name: 'CANCELLED_BECOMES_A_FAILURE',
    edits: edit(
      EXECUTE,
      'if (status === RUN_STATUS.CANCELLED) return cancelled(runId, counts);',
      '',
    ),
  },
  {
    name: 'RUN_HASH_NOT_CHECKED',
    edits: edit(CONTEXT, 'setup.runHash !== blueprint.run.runHash', 'false'),
  },
  {
    name: 'CONFIG_HASH_NOT_CHECKED',
    edits: edit(CONTEXT, 'strategy.configHash !== blueprint.version.configHash ||', 'false ||'),
  },
  {
    name: 'WARMUP_SHORTER_THAN_THE_LEAD_IN',
    edits: edit(
      CONTEXT,
      'const leadInCandles = computeStrategyLeadInCandles(strategy.config);',
      'const leadInCandles = computeStrategyLeadInCandles(strategy.config) - 1;',
    ),
  },
  {
    name: 'INSUFFICIENT_HISTORY_NOT_CHECKED',
    edits: edit(STREAM, 'if (leadIn.length < context.leadInCandles) {', 'if (false) {'),
  },
  {
    name: 'OPEN_POSITION_VALUED_AT_THE_WRONG_PRICE',
    edits: edit(
      'backtest-metrics.ts',
      'lastClose: params.lastClose,',
      'lastClose: context.setup.parameters.initialBalance,',
    ),
  },
  {
    name: 'ERROR_SWALLOWED',
    edits: edit(
      'run-backtest.ts',
      'isRecorded: await recordFailure(session, failure.errorCode),',
      'isRecorded: false,',
    ),
  },
  {
    name: 'ERROR_TEXT_TRAVELS',
    edits: edit(
      'describe-failure.ts',
      'message: `Falha inesperada (${name}).`',
      'message: error instanceof Error ? error.message : name',
    ),
  },
  {
    name: 'RESUMED_POSITION_FORGOTTEN',
    edits: edit('position-tracker.ts', 'if (seed !== null) {', 'if (false as boolean) {'),
  },
  {
    name: 'CHECKPOINT_NOT_VALIDATED',
    edits: edit(RESTORE, 'if (!isOwnState) throw unusable();', ''),
  },
  {
    name: 'SENTIMENT_INSERTION_CUTOFF_IGNORED',
    edits: edit(
      'sentiment-picker.ts',
      'insertionCutoff: candle.closeTime,',
      'insertionCutoff: Number.MAX_SAFE_INTEGER,',
    ),
  },
  {
    name: 'NO_CANDLES_NOT_CHECKED',
    edits: edit(STREAM, 'if (first.done === true) {', 'if (false as boolean) {'),
  },
  {
    name: 'ONE_QUERY_PER_CANDLE',
    edits: edit(
      STREAM,
      'const span = params.pageCandles * params.durationMilliseconds;',
      'const span = params.durationMilliseconds;',
    ),
  },
];

describe('backtest: the contract rejects every mutant of the production source', () => {
  const verdicts = new Map<string, BacktestMutantVerdict>();

  // Cada mutante é um processo `bun test` à parte; quatro de cada vez mantêm a suíte rápida.
  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runBacktestMutant(next));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(removeBacktestMutants);

  test('the control copy (no edit) passes the same tests: the harness is sound', () => {
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
});
