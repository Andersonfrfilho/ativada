// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { removeMutants } from './fixtures/strategy-engine/signal/signal-mutation.fixture.js';
import {
  runTriggerMutant,
  type TriggerMutantVerdict,
  type TriggerSourceEdit,
  type TriggerSourceMutant,
} from './fixtures/strategy-engine/trigger/trigger-mutation.fixture.js';

const MUTANT_TIMEOUT_MILLISECONDS = 600_000;
const PARALLEL_MUTANTS = 4;
const CONTROL: TriggerSourceMutant = { name: 'CONTROL', edits: [] };
const PRICE = 'trigger/trigger-measure-price.ts';
const VALUE = 'trigger/trigger-measure-value.ts';
const RULE = 'trigger/trigger-rule.ts';
const COMPUTE = 'trigger/compute-next-triggers.ts';
const LATEST = 'trigger/compute-latest-triggers.ts';
const CHANNEL_OUTPUT_HEAD =
  'const output = (name: string): EngineDecimalValue =>\n    decimalFromIndicator(\n      readIndicatorOutput({ value: reading.current, output: name, indicatorId: rule.id }),\n    );\n  const isBreakout';

function edit(file: string, find: string, replace: string, occurrences = 1): TriggerSourceEdit[] {
  return [{ file, find, replace, occurrences }];
}

const MUTANTS: readonly TriggerSourceMutant[] = [
  {
    name: 'EMA_WEIGHT_WITHOUT_THE_PLUS_ONE',
    edits: edit(PRICE, 'return TWO.dividedBy(period + 1);', 'return TWO.dividedBy(period);'),
  },
  {
    name: 'EMA_SLOW_TERM_USES_THE_FAST_WEIGHT',
    edits: edit(PRICE, 'ONE.minus(slowWeight).times(slow)', 'ONE.minus(fastWeight).times(slow)'),
  },
  {
    name: 'EMA_FAST_TERM_USES_THE_SLOW_WEIGHT',
    edits: edit(PRICE, 'ONE.minus(fastWeight).times(fast)', 'ONE.minus(slowWeight).times(fast)'),
  },
  {
    name: 'EMA_DENOMINATOR_REVERSED',
    edits: edit(
      PRICE,
      'numerator.dividedBy(fastWeight.minus(slowWeight))',
      'numerator.dividedBy(slowWeight.minus(fastWeight))',
    ),
  },
  {
    name: 'EMA_ENTRY_DIRECTION_BELOW',
    edits: edit(
      PRICE,
      '    entryDirection: TRIGGER_DIRECTION.ABOVE,\n    basis: TRIGGER_BASIS.EXACT,\n    current: params.close,',
      '    entryDirection: TRIGGER_DIRECTION.BELOW,\n    basis: TRIGGER_BASIS.EXACT,\n    current: params.close,',
    ),
  },
  {
    name: 'EMA_BASIS_INDICATIVE',
    edits: edit(
      PRICE,
      '    basis: TRIGGER_BASIS.EXACT,\n    current: params.close,\n    entryThreshold: price,',
      '    basis: TRIGGER_BASIS.INDICATIVE,\n    current: params.close,\n    entryThreshold: price,',
    ),
  },
  {
    name: 'CHANNEL_ENTRY_THRESHOLD_SWAPPED',
    edits: edit(
      PRICE,
      "entryThreshold: isBreakout ? output('upper') : output('lower'),",
      "entryThreshold: isBreakout ? output('lower') : output('upper'),",
    ),
  },
  {
    name: 'CHANNEL_EXIT_THRESHOLD_SWAPPED',
    edits: edit(
      PRICE,
      "exitThreshold: isBreakout ? output('lower') : output('upper'),",
      "exitThreshold: isBreakout ? output('upper') : output('lower'),",
    ),
  },
  {
    name: 'CHANNEL_ENTRY_DIRECTION_SWAPPED',
    edits: edit(
      PRICE,
      'entryDirection: isBreakout ? TRIGGER_DIRECTION.ABOVE : TRIGGER_DIRECTION.BELOW,',
      'entryDirection: isBreakout ? TRIGGER_DIRECTION.BELOW : TRIGGER_DIRECTION.ABOVE,',
    ),
  },
  {
    name: 'CHANNEL_READS_THE_PREVIOUS_CHANNEL',
    edits: edit(
      PRICE,
      CHANNEL_OUTPUT_HEAD,
      CHANNEL_OUTPUT_HEAD.replace('reading.current', 'reading.previous'),
    ),
  },
  {
    name: 'BOLLINGER_BASIS_EXACT',
    edits: edit(
      PRICE,
      'basis: isBreakout ? TRIGGER_BASIS.EXACT : TRIGGER_BASIS.INDICATIVE,',
      'basis: TRIGGER_BASIS.EXACT,',
    ),
  },
  {
    name: 'MACD_GAP_REVERSED',
    edits: edit(
      VALUE,
      "minuend: 'macd', subtrahend: 'signal'",
      "minuend: 'signal', subtrahend: 'macd'",
    ),
  },
  {
    name: 'OBV_GAP_REVERSED',
    edits: edit(VALUE, "minuend: 'obv', subtrahend: 'ema'", "minuend: 'ema', subtrahend: 'obv'"),
  },
  {
    name: 'GAP_ENTRY_DIRECTION_BELOW',
    edits: edit(
      VALUE,
      '    entryDirection: TRIGGER_DIRECTION.ABOVE,\n    basis: TRIGGER_BASIS.INDICATIVE,\n    current: params.gap,',
      '    entryDirection: TRIGGER_DIRECTION.BELOW,\n    basis: TRIGGER_BASIS.INDICATIVE,\n    current: params.gap,',
    ),
  },
  {
    name: 'RSI_ENTRY_DIRECTION_ABOVE',
    edits: edit(
      VALUE,
      '    entryDirection: TRIGGER_DIRECTION.BELOW,\n    basis: TRIGGER_BASIS.INDICATIVE,\n    current: decimalFromIndicator(value),',
      '    entryDirection: TRIGGER_DIRECTION.ABOVE,\n    basis: TRIGGER_BASIS.INDICATIVE,\n    current: decimalFromIndicator(value),',
    ),
  },
  {
    name: 'RSI_THRESHOLDS_SWAPPED',
    edits: edit(
      VALUE,
      'entryThreshold: new EngineDecimal(rule.oversold),\n    exitThreshold: new EngineDecimal(rule.overbought),',
      'entryThreshold: new EngineDecimal(rule.overbought),\n    exitThreshold: new EngineDecimal(rule.oversold),',
    ),
  },
  {
    name: 'FEAR_GREED_THRESHOLDS_SWAPPED',
    edits: edit(
      VALUE,
      'entryThreshold: new EngineDecimal(rule.fearAtOrBelow),\n    exitThreshold: new EngineDecimal(rule.greedAtOrAbove),',
      'entryThreshold: new EngineDecimal(rule.greedAtOrAbove),\n    exitThreshold: new EngineDecimal(rule.fearAtOrBelow),',
    ),
  },
  {
    name: 'FEAR_GREED_ENTRY_DIRECTION_ABOVE',
    edits: edit(
      VALUE,
      '    entryDirection: TRIGGER_DIRECTION.BELOW,\n    basis: TRIGGER_BASIS.INDICATIVE,\n    current: sentiment === null',
      '    entryDirection: TRIGGER_DIRECTION.ABOVE,\n    basis: TRIGGER_BASIS.INDICATIVE,\n    current: sentiment === null',
    ),
  },
  {
    name: 'FEAR_GREED_MISSING_BECOMES_ZERO',
    edits: edit(
      VALUE,
      'current: sentiment === null ? null : new EngineDecimal(sentiment.value),',
      'current: new EngineDecimal(sentiment?.value ?? 0),',
    ),
  },
  {
    name: 'THRESHOLD_ROUNDED_TOWARDS_THE_USER',
    edits: edit(
      RULE,
      'direction === TRIGGER_DIRECTION.ABOVE ? EngineDecimal.ROUND_CEIL : EngineDecimal.ROUND_FLOOR',
      'direction === TRIGGER_DIRECTION.ABOVE ? EngineDecimal.ROUND_FLOOR : EngineDecimal.ROUND_CEIL',
    ),
  },
  {
    name: 'DISTANCE_ROUNDED_DOWN',
    edits: edit(
      RULE,
      'value.toDecimalPlaces(TRIGGER_DECIMAL_PLACES, EngineDecimal.ROUND_CEIL),',
      'value.toDecimalPlaces(TRIGGER_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR),',
    ),
  },
  {
    name: 'REMAINING_ABOVE_REVERSED',
    edits: edit(
      RULE,
      '? threshold.minus(current)\n    : current.minus(threshold)',
      '? current.minus(threshold)\n    : threshold.minus(current)',
    ),
  },
  {
    name: 'EXIT_DIRECTION_NOT_OPPOSITE',
    edits: edit(
      RULE,
      'isEntry ? measure.entryDirection : opposite(measure.entryDirection)',
      'measure.entryDirection',
    ),
  },
  {
    name: 'EXIT_THRESHOLD_IS_THE_ENTRY_ONE',
    edits: edit(
      RULE,
      'isEntry ? measure.entryThreshold : measure.exitThreshold,',
      'measure.entryThreshold,',
    ),
  },
  {
    name: 'IS_MET_ALWAYS_LOOKS_FOR_A_BUY_VOTE',
    edits: edit(RULE, 'vote.vote === (isEntry ? 1 : -1)', 'vote.vote === 1'),
  },
  {
    name: 'RATE_FOR_EVERY_METRIC',
    edits: edit(RULE, 'distance === null || !isPrice ? null', 'distance === null ? null'),
  },
  {
    name: 'RATE_IS_THE_DISTANCE',
    edits: edit(RULE, 'ceilPlaces(distance.dividedBy(close))', 'ceilPlaces(distance)'),
  },
  {
    name: 'CURRENT_VALUE_NOT_ROUNDED',
    edits: edit(RULE, 'current.toDecimalPlaces(TRIGGER_DECIMAL_PLACES)', 'current'),
  },
  {
    name: 'SCORE_GAP_REVERSED',
    edits: edit(
      COMPUTE,
      'isEntry ? threshold.minus(score) : score.minus(threshold)',
      'isEntry ? score.minus(threshold) : threshold.minus(score)',
    ),
  },
  {
    name: 'SCORE_THRESHOLD_SWAPPED',
    edits: edit(
      COMPUTE,
      'isEntry ? config.thresholds.buy : config.thresholds.sell',
      'isEntry ? config.thresholds.sell : config.thresholds.buy',
    ),
  },
  {
    name: 'STALE_SENTIMENT_NOT_FILTERED',
    edits: edit(
      COMPUTE,
      'sentiment: evaluation.sentiment,',
      'sentiment: params.sentiment ?? null,',
    ),
  },
  {
    name: 'LATEST_READS_THE_PREVIOUS_CANDLE',
    edits: edit(
      LATEST,
      'candle: toIndicatorCandle(last),',
      'candle: toIndicatorCandle(candles[lastIndex - 1] ?? last),',
    ),
  },
  {
    name: 'LATEST_STATE_ONE_CANDLE_SHORT',
    edits: edit(LATEST, 'candles.slice(0, lastIndex)', 'candles.slice(0, lastIndex - 1)'),
  },
  {
    name: 'LATEST_ANSWERS_DURING_THE_WARM_UP',
    edits: edit(LATEST, 'if (signal === null) return null;', ''),
  },
  {
    name: 'LATEST_IGNORES_THE_LAST_SENTIMENT',
    edits: edit(
      LATEST,
      'const sentiment = sentiments?.[lastIndex];',
      'const sentiment = undefined;',
    ),
  },
  {
    name: 'LATEST_ALWAYS_AWAITING_ENTRY',
    edits: edit(LATEST, 'state: params.state,', "state: 'awaiting_entry',"),
  },
];

describe('mutantes dos próximos gatilhos', () => {
  const verdicts = new Map<string, TriggerMutantVerdict>();

  beforeAll(async () => {
    const queue = [CONTROL, ...MUTANTS];
    const worker = async (): Promise<void> => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        verdicts.set(next.name, await runTriggerMutant(next));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_MUTANTS }, worker));
  }, MUTANT_TIMEOUT_MILLISECONDS);

  afterAll(removeMutants);

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
});
