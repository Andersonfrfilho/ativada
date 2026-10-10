// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  computeIndicatorSeries,
  type IndicatorDefinition,
  type IndicatorValue,
} from '../../../packages/strategy-engine/src/index.js';
import { expectIndicatorContract } from './indicator-contract.fixture.js';
import {
  compareWithOracle,
  compareWithReference,
  DEFAULT_TOLERANCE,
} from './oracle/oracle-comparison.fixture.js';
import {
  BTCUSDT_HOURLY_SERIES,
  ETHUSDT_DAILY_SERIES,
  type MarketSeries,
} from './oracle/oracle-market.fixture.js';
import type { OracleSpec } from './oracle/oracle-specs.fixture.js';
import { EDGE_SERIES } from './oracle/oracle-synthetic.fixture.js';

export type ConformanceSpec<TParams, TValue extends IndicatorValue> = {
  readonly oracle: OracleSpec<TParams>;
  readonly definition: IndicatorDefinition<TParams, TValue>;
};

const REAL_SERIES: readonly MarketSeries[] = [BTCUSDT_HOURLY_SERIES, ETHUSDT_DAILY_SERIES];
const REAL_CUT_STRIDE = 29;

// O que todo indicador da T2.2 precisa provar, em cada uma das séries (reais e de borda): o horizonte
// do ADR, o contrato do harness, o oráculo de alta precisão a cada candle e a `trading-signals`.
export function describeIndicatorConformance<TParams, TValue extends IndicatorValue>(
  spec: ConformanceSpec<TParams, TValue>,
): void {
  const { oracle, definition } = spec;
  const toActual = (market: MarketSeries): readonly (TValue | undefined)[] =>
    computeIndicatorSeries({
      definition,
      params: oracle.params,
      candles: market.indicatorCandles,
    });

  describe(`indicator ${oracle.name}`, () => {
    test('declares the warmup and convergence of the ADR table', () => {
      const indicator = definition.create(oracle.params);
      expect({
        warmupCandles: indicator.warmupCandles,
        convergenceCandles: indicator.convergenceCandles,
      }).toStrictEqual(oracle.horizon);
    });

    for (const market of [...REAL_SERIES, ...EDGE_SERIES]) {
      const isReal = REAL_SERIES.includes(market);

      test(`${market.name}: passes the indicator contract`, () => {
        expectIndicatorContract({
          definition,
          params: oracle.params,
          candles: market.indicatorCandles,
          cutStride: isReal ? REAL_CUT_STRIDE : 1,
        });
      });

      test(`${market.name}: stays within ${DEFAULT_TOLERANCE} of the high-precision oracle`, () => {
        const comparison = compareWithOracle({
          actual: toActual(market),
          expected: oracle.computeOracle(market.oracleCandles),
          ...(oracle.floorOf === undefined
            ? {}
            : { floorOf: oracle.floorOf(market.oracleCandles) }),
        });
        expect(comparison.comparedCount).toBeGreaterThan(0);
        expect(comparison.maxError).toBeLessThan(DEFAULT_TOLERANCE);
      });

      // A `trading-signals` só entra nas séries reais: nas de borda (platô, volume zero) ela diverge
      // do ADR de propósito (RSI de platô, VWAP sem volume) e o oráculo de alta precisão é a verdade.
      if (!isReal) continue;

      if (oracle.computeReference === undefined) continue;
      const computeReference = oracle.computeReference;

      test(`${market.name}: matches trading-signals with aligned conventions`, () => {
        const comparison = compareWithReference({
          actual: toActual(market),
          expected: computeReference(market.indicatorCandles),
          fromIndex: oracle.referenceFromIndex ?? 0,
          ...(oracle.floorOf === undefined
            ? {}
            : { floorOf: oracle.floorOf(market.oracleCandles) }),
        });
        expect(comparison.comparedCount).toBeGreaterThan(0);
        expect(comparison.maxError).toBeLessThan(DEFAULT_TOLERANCE);
      });
    }
  });
}
