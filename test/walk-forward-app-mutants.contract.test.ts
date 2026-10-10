// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  APP_MUTANT_TARGET,
  removeMutantCopies,
  runSourceMutant,
  type MutantVerdict,
  type SourceEdit,
  type SourceMutant,
} from './fixtures/walk-forward/walk-forward-mutation.fixture.js';

const MUTANT_TIMEOUT_MILLISECONDS = 900_000;
const PARALLEL_MUTANTS = 4;
const CONTROL: SourceMutant = { name: 'CONTROL', edits: [] };
const SPANS = 'walk-forward/window-spans.ts';
const SIGNALS = 'walk-forward/signal-series.ts';
const COMMIT = 'walk-forward/commit-unit.ts';
const REPORT = 'walk-forward/build-report.ts';
const EVALUATE = 'walk-forward/evaluate-window.ts';
const TEST_PHASE = 'walk-forward/test-phase.ts';
const CHECKPOINT = 'walk-forward/walk-forward-checkpoint.ts';
const WALLET = 'walk-forward/run-window-wallet.ts';
const COLLECTION = 'walk-forward/test-collection.ts';
const PROGRESS = 'walk-forward/walk-forward-progress.ts';
const REQUEST = 'walk-forward/walk-forward-request.schema.ts';
const POOL = 'walk-forward/search-thread-pool.ts';
const MESSAGES = 'walk-forward/walk-forward-messages.ts';

function edit(file: string, find: string, replace: string, occurrences = 1): SourceEdit[] {
  return [{ file, find, replace, occurrences }];
}

const MUTANTS: readonly SourceMutant[] = [
  {
    name: 'TRAIN_USES_TEST_DATA_LOOKAHEAD',
    edits: edit(
      SPANS,
      'train: spanOf(series, window.trainStart, window.trainEnd),',
      'train: spanOf(series, window.trainStart, window.testEnd),',
    ),
  },
  {
    name: 'SIGNAL_FED_THE_NEXT_CANDLE',
    edits: edit(
      SIGNALS,
      'const candle = series.candles[index];',
      'const candle = series.candles[index + 1];',
    ),
  },
  {
    name: 'GAP_NOT_DECLARED_TO_THE_ENGINE',
    edits: edit(
      SIGNALS,
      'confirmedGapCandles: index > firstIndex && gap > 0 ? gap : undefined,',
      'confirmedGapCandles: undefined,',
    ),
  },
  {
    name: 'CHECKPOINT_BEFORE_THE_WRITE',
    edits: edit(
      COMMIT,
      '    if (params.windows !== undefined) await writer.appendWindows(params.windows);\n    if (params.rows !== undefined) await writer.appendResults(params.rows);\n    if (!(await writer.saveCheckpoint(checkpoint))) {',
      '    const isSaved = await writer.saveCheckpoint(checkpoint);\n    if (params.windows !== undefined) await writer.appendWindows(params.windows);\n    if (params.rows !== undefined) await writer.appendResults(params.rows);\n    if (!isSaved) {',
    ),
  },
  {
    name: 'WINDOW_OUTSIDE_THE_UNIT_TRANSACTION',
    edits: edit(
      COMMIT,
      'if (params.windows !== undefined) await writer.appendWindows(params.windows);',
      'if (params.windows !== undefined) await params.session.inBatch((second) => second.appendWindows(params.windows ?? []));',
    ),
  },
  {
    name: 'CANCELLATION_IGNORED',
    edits: edit(
      COMMIT,
      "if (status !== RUN_STATUS.RUNNING) return { kind: 'stopped', status };",
      '',
    ),
  },
  {
    name: 'REPORT_IS_THE_IN_SAMPLE',
    edits: [
      ...edit(
        REPORT,
        '      ...outOfSample.metrics,\n      overfitting,',
        '      ...inSampleMetricsOf(ordered),\n      overfitting,',
      ),
      ...edit(
        REPORT,
        'export type BuildReportParams = {',
        'function inSampleMetricsOf(rows: readonly WalkForwardWindowInput[]): Record<string, unknown> {\n  const record = rows[0]?.inSample;\n  const metrics: unknown = typeof record === "object" && record !== null && !Array.isArray(record) ? record["metrics"] : undefined;\n  return typeof metrics === "object" && metrics !== null ? { ...metrics } : {};\n}\n\nexport type BuildReportParams = {',
      ),
    ],
  },
  {
    name: 'MIN_TRADES_OPTION_IGNORED',
    edits: edit(
      EVALUATE,
      'minTradesPerWindow: deps.context.request.minTradesPerWindow,',
      'minTradesPerWindow: 1,',
    ),
  },
  {
    name: 'COMPLETED_WINDOWS_REDONE_ON_RESUME',
    edits: edit(TEST_PHASE, 'context.windows.slice(stored.length)', 'context.windows'),
  },
  {
    name: 'SEARCH_CHECKPOINT_IGNORED_ON_RESUME',
    edits: edit(
      CHECKPOINT,
      'if (params.checkpoint?.engineState === undefined) return results;',
      'return results;',
    ),
  },
  {
    name: 'CARRIED_EQUITY_NOT_RESTORED_ON_RESUME',
    edits: edit(TEST_PHASE, 'const last = stored.at(-1);', 'const last = undefined;'),
  },
  {
    name: 'WINDOW_END_HALT_MISSING',
    edits: edit(WALLET, 'if (params.index === params.span.limitIndex - 1) {', 'if (false) {'),
  },
  {
    name: 'PARKED_WINDOW_STILL_TRADES',
    edits: edit(
      WALLET,
      'if (params.isParked && params.index === params.span.anchorIndex) {',
      'if (false) {',
    ),
  },
  {
    name: 'KEY_PREFIX_DROPPED',
    edits: edit(EVALUATE, 'keyPrefix: `w${params.windowIndex}:`,', "keyPrefix: '',", 2),
  },
  {
    name: 'ANCHOR_SIGNAL_AND_EQUITY_PERSISTED',
    edits: edit(
      COLLECTION,
      'const isAnchor = signal?.candleOpenTime === anchorCandleTime;',
      'const isAnchor = false;',
    ),
  },
  {
    name: 'PROGRESS_REACHES_100_BEFORE_COMPLETION',
    edits: edit(
      PROGRESS,
      'return Math.min(WALK_FORWARD_PROGRESS_BEFORE_COMPLETION, Math.max(0, value));',
      'return Math.max(0, value);',
    ),
  },
  {
    name: 'REQUEST_HASH_CONSTANT',
    edits: edit(REQUEST, '.update(canonicalJson(fingerprint))', ".update('constant')"),
  },
  {
    name: 'ROW_REQUEST_IGNORED_OPTIONS_WIN',
    edits: edit(
      REQUEST,
      'if (stored === undefined) return fallback;',
      'if (stored !== null) return fallback;',
    ),
  },
  {
    name: 'INVALID_ROW_REQUEST_FALLS_BACK_TO_OPTIONS',
    edits: edit(
      REQUEST,
      'if (parsed.success) return parsed.data;',
      'if (parsed.success) return parsed.data;\n  if (fallback.grid !== undefined) return fallback;',
    ),
  },
  {
    name: 'THREAD_MESSAGE_ACCEPTS_EXTRA_FIELDS',
    edits: edit(
      MESSAGES,
      'export const WALK_FORWARD_REQUEST_MESSAGE_SCHEMA = z.strictObject({',
      'export const WALK_FORWARD_REQUEST_MESSAGE_SCHEMA = z.object({',
    ),
  },
  {
    name: 'INVALID_THREAD_EVENT_IGNORED',
    edits: edit(
      POOL,
      'if (event === undefined || event.type === SEARCH_MESSAGE_TYPE.FAILED) return this.fail();',
      'if (event === undefined) return;\n    if (event.type === SEARCH_MESSAGE_TYPE.FAILED) return this.fail();',
    ),
  },
];

describe('walk-forward (execução): o contrato reprova cada mutante do código de produção', () => {
  const verdicts = new Map<string, MutantVerdict>();

  // Cada mutante é um processo `bun test` à parte; quatro de cada vez mantêm a suíte rápida.
  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runSourceMutant(APP_MUTANT_TARGET, next));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(() => removeMutantCopies(APP_MUTANT_TARGET));

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
