// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  LIVE_ANALYST_JUDGE_TEST_FILES,
  removeLiveMutants,
  runLiveMutant,
  type LiveMutantVerdict,
  type LiveSourceEdit,
  type LiveSourceMutant,
} from './fixtures/live/live-mutation.fixture.js';

const MUTANT_TIMEOUT_MILLISECONDS = 900_000;
const PARALLEL_MUTANTS = 4;
const CONTROL: LiveSourceMutant = { name: 'CONTROL', edits: [] };
const STEP = 'live-step.ts';
const ANALYST_CACHE = 'analyst-series-cache.ts';
const ANALYST_STEP = 'analyst-step.ts';
const ANALYST_HISTORY = 'analyst-run-history.ts';
const ANALYST_CONTEXT = 'load-analyst-context.ts';
const ANALYST_RECORD = 'analyst-record.ts';
const ANALYST_FAILURE = 'analyst-failure.ts';
const ANALYST_CONSTANT = 'analyst-live.constant.ts';

function edit(file: string, find: string, replace: string, occurrences = 1): LiveSourceEdit[] {
  return [{ file, find, replace, occurrences }];
}

// O analista de risco em sombra no passo ao vivo (spec 007, T2.3): a série do par por ronda, a decisão na transação do passo,
// a falha que grava só o código e o pedido gravado na execução.
const MUTANTS: readonly LiveSourceMutant[] = [
  {
    name: 'ANALYST_SERIES_NOT_SHARED_BETWEEN_SIMULATIONS',
    edits: edit(
      ANALYST_CACHE,
      'const entry = anchors.get(anchor) ?? createEntry(anchor);',
      'const entry = createEntry(anchor);',
    ),
  },
  {
    name: 'ANALYST_SERIES_CACHE_NOT_SHARED_BETWEEN_PASSES',
    edits: edit(
      'live-evaluator.ts',
      'evaluateLiveRun({ dependencies, engine, maxSteps, runId, analystSeries }),',
      'evaluateLiveRun({ dependencies, engine, maxSteps, runId }),',
    ),
  },
  {
    name: 'ANALYST_SERIES_ANCHOR_SLIDES_WITH_THE_CANDLE',
    edits: edit(
      ANALYST_CACHE,
      'const anchor = computeSeriesAnchor(request.candleTime);',
      'const anchor = request.candleTime;',
    ),
  },
  {
    name: 'ANALYST_CANDLES_NOT_CUT_AT_THE_DECISION',
    edits: edit(ANALYST_CACHE, 'candles: entry.candles.slice(0, end),', 'candles: entry.candles,'),
  },
  {
    name: 'ANALYST_VOTES_NOT_CUT_AT_THE_DECISION',
    edits: edit(
      ANALYST_CACHE,
      '[SPECIALIST_KEY.TREND]: entry.votes.trend.slice(0, end),',
      '[SPECIALIST_KEY.TREND]: entry.votes.trend,',
    ),
  },
  {
    name: 'ANALYST_SENTIMENT_IGNORED',
    edits: edit(ANALYST_CACHE, 'observations: source.observations,', 'observations: [],'),
  },
  {
    name: 'ANALYST_MISSING_CANDLE_USES_THE_NEIGHBOUR',
    edits: edit(
      ANALYST_CACHE,
      'if (entry.candles[end - 1]?.openTime !== candleTime) {',
      'if (false as boolean) {',
    ),
  },
  {
    name: 'ANALYST_CANDLE_READ_ERROR_NOT_TYPED',
    edits: edit(
      ANALYST_CACHE,
      '  } catch {\n    throw new AnalystFailure(ANALYST_FAILURE_CODE.SERIES_UNAVAILABLE);\n  }\n}',
      '  } catch (error: unknown) {\n    throw error;\n  }\n}',
    ),
  },
  {
    name: 'ANALYST_FAILURE_ESCAPES_THE_STEP',
    edits: edit(
      ANALYST_STEP,
      '  } catch (error: unknown) {\n    return toFailedRecord({',
      '  } catch (error: unknown) {\n    throw error;\n    return toFailedRecord({',
    ),
  },
  {
    name: 'ANALYST_STEP_NOT_RECORDED_IN_THE_HISTORY',
    edits: edit(ANALYST_STEP, '  kit.history.record(step.candle, step.result.decisions);\n', ''),
  },
  {
    name: 'ANALYST_DECISION_NOT_HANDED_TO_THE_COMMIT',
    edits: edit(STEP, '    ...(analyst === undefined ? {} : { analyst }),\n', ''),
  },
  {
    name: 'ANALYST_HISTORY_ERROR_NOT_TYPED',
    edits: edit(
      ANALYST_HISTORY,
      '      } catch {\n        throw new AnalystFailure(ANALYST_FAILURE_CODE.SERIES_UNAVAILABLE);\n      }',
      '      } catch (error: unknown) {\n        throw error;\n      }',
    ),
  },
  {
    name: 'ANALYST_HISTORY_SEEDED_EVEN_WHEN_THE_READ_FAILS',
    edits: edit(
      ANALYST_HISTORY,
      '      if (isSeeded) return;\n',
      '      if (isSeeded) return;\n      isSeeded = true;\n',
    ),
  },
  {
    name: 'ANALYST_HISTORY_LOOKBACK_TOO_SHORT',
    edits: edit(
      ANALYST_CONSTANT,
      'export const ANALYST_HISTORY_LOOKBACK_CANDLES = 2881;',
      'export const ANALYST_HISTORY_LOOKBACK_CANDLES = 100;',
    ),
  },
  {
    name: 'ANALYST_STRATEGY_VOTE_INVERTED',
    edits: edit(
      ANALYST_HISTORY,
      "return score.startsWith('-') ? -1 : 1;",
      "return score.startsWith('-') ? 1 : -1;",
    ),
  },
  {
    name: 'ANALYST_EQUITY_REFERENCE_IGNORED',
    edits: edit(
      ANALYST_CONTEXT,
      'equityReference: kit.history.equityAt(referenceTime) ?? null,',
      'equityReference: null,',
    ),
  },
  {
    name: 'ANALYST_NEVER_CATCHING_UP',
    edits: edit(
      ANALYST_CONTEXT,
      'isCatchingUp: candle.openTime < kit.source.lastOpenTime,',
      'isCatchingUp: false,',
    ),
  },
  {
    name: 'ANALYST_GOVERN_REQUEST_ACCEPTED',
    edits: edit(
      ANALYST_CONTEXT,
      "readProperty(analyst, 'mode') === ANALYST_RECORD_MODE.SHADOW &&",
      'true &&',
    ),
  },
  {
    name: 'ANALYST_VERSION_NOT_CHECKED',
    edits: edit(
      ANALYST_CONTEXT,
      "readProperty(analyst, 'version') === ANALYST_VERSION &&",
      'true &&',
    ),
  },
  {
    name: 'ANALYST_ALLOWED_ON_ANY_CANDLE',
    edits: edit(ANALYST_CONTEXT, 'run.timeframe === ANALYST_RULES.baseTimeframe', 'true'),
  },
  {
    name: 'ANALYST_RECORD_MARKED_AS_GOVERN',
    edits: edit(ANALYST_RECORD, 'mode: ANALYST_RECORD_MODE.SHADOW,', "mode: 'govern',", 2),
  },
  {
    name: 'ANALYST_FAILED_RECORD_WITHOUT_THE_MESSAGE',
    edits: edit(ANALYST_RECORD, 'message: FAILURE_MESSAGE,', 'message: undefined,'),
  },
  {
    name: 'ANALYST_ENGINE_REFUSAL_WITHOUT_ITS_CODE',
    edits: edit(
      ANALYST_FAILURE,
      'return `${ANALYST_FAILURE_CODE.ENGINE_REFUSED}:${error.code}`;',
      'return ANALYST_FAILURE_CODE.ENGINE_REFUSED;',
    ),
  },
  {
    name: 'ANALYST_UNKNOWN_FAILURE_LEAKS_THE_ERROR_TEXT',
    edits: edit(
      ANALYST_FAILURE,
      'return ANALYST_FAILURE_CODE.INPUT_INVALID;',
      'return String(error);',
    ),
  },
];

describe('mutantes do analista de risco em sombra no passo ao vivo', () => {
  const verdicts = new Map<string, LiveMutantVerdict>();

  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runLiveMutant(next, LIVE_ANALYST_JUDGE_TEST_FILES));
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
