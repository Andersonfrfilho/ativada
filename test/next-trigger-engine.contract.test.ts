// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  advanceIndicators,
  computeStrategyLeadInCandles,
  createStrategySignalState,
  createStrategyVersion,
  signalStep,
  toIndicatorCandle,
  type EngineCandle,
  type SignalState,
} from '../packages/strategy-engine/src/index.js';
import { buildSyntheticCandles } from './fixtures/backtest/synthetic-candles.fixture.js';
import { buildReferenceRun } from './fixtures/strategy-engine/engine-scenarios.fixture.js';
import { loadTriggerApi } from './fixtures/strategy-engine/trigger/trigger-api.fixture.js';

const api = await loadTriggerApi();
const EMA_ONLY = createStrategyVersion({
  schemaVersion: 1,
  rules: [{ id: 'ema-5-12', kind: 'ema_cross', fastPeriod: 5, slowPeriod: 12 }],
  thresholds: { buy: '1', sell: '-1' },
});
const RUN = buildReferenceRun({ symbol: 'BTCUSDT', timeframe: '1h' });
const CANDLES = buildSyntheticCandles({
  count: 400,
  seed: 77,
  firstOpenTime: Date.UTC(2024, 0, 1),
});
const RELATIVE_MARGIN = 1e-9;
const STEP_EVERY = 5;

function withClose(next: EngineCandle, previous: EngineCandle, close: number): EngineCandle {
  const open = Number(previous.close);
  return {
    ...next,
    open: previous.close,
    close: String(close),
    high: String(Math.max(open, close)),
    low: String(Math.min(open, close)),
  };
}

function voteAfter(state: SignalState, candle: EngineCandle): number {
  const result = signalStep({ strategy: EMA_ONLY, market: RUN.parameters, state, candle });
  return result.signal?.votes[0]?.vote ?? Number.NaN;
}

type Probe = { readonly price: number; readonly entry: number; readonly exit: number };

// O fechamento calculado, aplicado como candle seguinte ao motor de produção, cruza a regra: um pouco acima
// compra, um pouco abaixo vende.
function probeAt(index: number): Probe | undefined {
  const config = EMA_ONLY.config;
  let state = createStrategySignalState(config);
  for (let at = 0; at < index; at += 1) {
    const candle = CANDLES[at];
    if (candle === undefined) return undefined;
    state = signalStep({ strategy: EMA_ONLY, market: RUN.parameters, state, candle }).state;
  }
  const candle = CANDLES[index];
  const next = CANDLES[index + 1];
  if (candle === undefined || next === undefined) return undefined;
  const advanced = advanceIndicators({
    config,
    snapshots: state.indicators,
    candle: toIndicatorCandle(candle),
  });
  const after = signalStep({ strategy: EMA_ONLY, market: RUN.parameters, state, candle });
  const triggers = api.computeNextTriggers({
    config,
    readings: advanced.readings,
    close: candle.close,
    closeTime: candle.closeTime,
    sentiment: undefined,
    sentimentSource: RUN.parameters.sentimentSource,
    state: 'awaiting_entry',
  });
  const threshold = Number(triggers.rules[0]?.threshold);
  const above = withClose(next, candle, threshold * (1 + RELATIVE_MARGIN));
  const below = withClose(next, candle, threshold * (1 - RELATIVE_MARGIN));
  return {
    price: threshold,
    entry: voteAfter(after.state, above),
    exit: voteAfter(after.state, below),
  };
}

describe('o fechamento calculado dispara exatamente o cruzamento no motor de produção', () => {
  const leadIn = computeStrategyLeadInCandles(EMA_ONLY.config);
  const indexes = Array.from(
    { length: Math.floor((CANDLES.length - 2 - leadIn) / STEP_EVERY) },
    (_, step) => leadIn + step * STEP_EVERY,
  );

  test('acima do preço calculado a EMA rápida passa a lenta (+1) e abaixo ela fica sob a lenta (−1)', () => {
    expect(indexes.length).toBeGreaterThan(40);
    for (const index of indexes) {
      const probe = probeAt(index);
      expect(probe).toBeDefined();
      expect(Number.isFinite(probe?.price)).toBe(true);
      expect(probe?.entry).toBe(1);
      expect(probe?.exit).toBe(-1);
    }
  });
});
