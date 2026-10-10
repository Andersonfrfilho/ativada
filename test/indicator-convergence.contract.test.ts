// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  ADX_INDICATOR,
  ATR_INDICATOR,
  computeIndicatorSeries,
  computeLeadInCandles,
  EMA_INDICATOR,
  MACD_INDICATOR,
  RSI_INDICATOR,
  type IndicatorCandle,
  type IndicatorDefinition,
  type IndicatorHorizon,
  type IndicatorValue,
} from '../packages/strategy-engine/src/index.js';
import {
  relativeErrorAgainstNumber,
  toOutputs,
} from './fixtures/strategy-engine/oracle/oracle-comparison.fixture.js';
import {
  BTCUSDT_HOURLY_SERIES,
  ETHUSDT_DAILY_SERIES,
} from './fixtures/strategy-engine/oracle/oracle-market.fixture.js';
import {
  ADX_SPEC,
  ATR_SPEC,
  EMA_SPEC,
  MACD_SPEC,
  RSI_SPEC,
} from './fixtures/strategy-engine/oracle/oracle-specs.fixture.js';

// ε do ADR 0002 §c: o que o horizonte declarado promete é peso residual < 1e-3 do primeiro candle.
const CONVERGENCE_TOLERANCE = 1e-3;
const START_OFFSETS = [17, 61, 130] as const;
const REAL_SERIES = [BTCUSDT_HOURLY_SERIES, ETHUSDT_DAILY_SERIES] as const;
const MACD_OUTPUTS: readonly string[] = ['macd', 'signal', 'histogram'];
const PLACAR_CLASSICO_LEAD_IN = 194;

type ConvergenceCase = {
  readonly name: string;
  readonly run: (candles: readonly IndicatorCandle[]) => readonly (IndicatorValue | undefined)[];
  readonly horizon: IndicatorHorizon;
};

function caseOf<TParams, TValue extends IndicatorValue>(
  name: string,
  definition: IndicatorDefinition<TParams, TValue>,
  spec: { readonly params: TParams; readonly horizon: IndicatorHorizon },
): ConvergenceCase {
  return {
    name,
    horizon: spec.horizon,
    run: (candles) => computeIndicatorSeries({ definition, params: spec.params, candles }),
  };
}

type GapParams = {
  readonly entry: ConvergenceCase;
  readonly candles: readonly IndicatorCandle[];
  readonly startOffset: number;
  readonly afterCandles: number;
};

// Maior diferença relativa entre a execução que começa em 0 (referência) e a que começa
// `startOffset` candles depois, contando `afterCandles` candles a partir do começo da segunda.
function gapAfter(params: GapParams): number {
  const { entry, candles, startOffset, afterCandles } = params;
  const reference = entry.run(candles);
  const late = entry.run(candles.slice(startOffset));
  let worst = 0;
  for (let index = afterCandles; index < late.length; index += 1) {
    const lateValue = late[index];
    const referenceValue = reference[index + startOffset];
    if (lateValue === undefined || referenceValue === undefined) {
      throw new Error(`Sem valor no índice ${index} depois do horizonte.`);
    }
    const referenceOutputs = toOutputs(referenceValue);
    for (const [output, value] of Object.entries(toOutputs(lateValue))) {
      const expected = referenceOutputs[output] ?? Number.NaN;
      const floor = MACD_OUTPUTS.includes(output)
        ? Math.abs(candles[index + startOffset]?.close ?? 0)
        : 0;
      worst = Math.max(worst, relativeErrorAgainstNumber({ actual: value, expected, floor }));
    }
  }
  return worst;
}

const CASES = [
  caseOf('EMA(21)', EMA_INDICATOR, EMA_SPEC),
  caseOf('MACD(12, 26, 9)', MACD_INDICATOR, MACD_SPEC),
  caseOf('RSI(14)', RSI_INDICATOR, RSI_SPEC),
  caseOf('ATR(14)', ATR_INDICATOR, ATR_SPEC),
  caseOf('ADX(14)', ADX_INDICATOR, ADX_SPEC),
] as const;

describe('the declared horizon makes the start of the history irrelevant (ε = 1e-3)', () => {
  test.each(
    CASES.flatMap((entry) =>
      REAL_SERIES.flatMap((market) =>
        START_OFFSETS.map((offset) => [entry.name, market.name, offset, entry, market] as const),
      ),
    ),
  )('%s on %s starting %p candles later', (_name, _marketName, startOffset, entry, market) => {
    const afterCandles = Math.max(entry.horizon.warmupCandles, entry.horizon.convergenceCandles);
    const gap = gapAfter({ entry, candles: market.indicatorCandles, startOffset, afterCandles });
    expect(gap).toBeLessThan(CONVERGENCE_TOLERANCE);
  });

  test('the lead-in of every indicator together (max of warmup and convergence) is 194 and covers them all', () => {
    const leadIn = computeLeadInCandles(CASES.map((entry) => entry.horizon));
    expect(leadIn).toBe(PLACAR_CLASSICO_LEAD_IN);
    for (const entry of CASES) {
      for (const market of REAL_SERIES) {
        for (const startOffset of START_OFFSETS) {
          const gap = gapAfter({
            entry,
            candles: market.indicatorCandles,
            startOffset,
            afterCandles: leadIn,
          });
          expect(gap).toBeLessThan(CONVERGENCE_TOLERANCE);
        }
      }
    }
  });
});

describe('the old "3 × warmup" factor was wrong for the Wilder family', () => {
  const WILDER_CASES = CASES.filter((entry) =>
    ['RSI(14)', 'ATR(14)', 'ADX(14)'].includes(entry.name),
  );

  test.each(WILDER_CASES.map((entry) => [entry.name, entry] as const))(
    '%s still differs by more than 1e-3 after 3 × its warmup (for some start)',
    (_name, entry) => {
      const afterCandles = 3 * entry.horizon.warmupCandles;
      const gaps = REAL_SERIES.flatMap((market) =>
        START_OFFSETS.map((startOffset) =>
          gapAfter({ entry, candles: market.indicatorCandles, startOffset, afterCandles }),
        ),
      );
      expect(Math.max(...gaps)).toBeGreaterThan(CONVERGENCE_TOLERANCE);
    },
  );
});
