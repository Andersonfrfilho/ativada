// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  advanceIndicators,
  createStrategySignalState,
  signalStep,
  toIndicatorCandle,
  type EngineCandle,
  type NextTriggers,
  type SignalDecision,
} from '../packages/strategy-engine/src/index.js';
import {
  REAL_SCENARIOS,
  sentimentScenario,
  type GoalScenario,
} from './fixtures/strategy-engine/goal/goal-scenarios.fixture.js';
import { loadTriggerApi } from './fixtures/strategy-engine/trigger/trigger-api.fixture.js';

const api = await loadTriggerApi();
const [btcHourly, ethDaily] = REAL_SCENARIOS;
if (btcHourly === undefined || ethDaily === undefined) throw new Error('Conjuntos reais ausentes.');

// Caminho de referência escrito à mão: o laço do sinal até o penúltimo candle, as leituras do último e o placar.
function referenceFor(params: {
  readonly scenario: GoalScenario;
  readonly candles: readonly EngineCandle[];
}): { signal: SignalDecision | null; triggers: NextTriggers } {
  const { strategy, run } = params.scenario;
  let state = createStrategySignalState(strategy.config);
  for (const candle of params.candles.slice(0, -1)) {
    state = signalStep({ strategy, market: run.parameters, state, candle }).state;
  }
  const last = params.candles.at(-1) as EngineCandle;
  const readings = advanceIndicators({
    config: strategy.config,
    snapshots: state.indicators,
    candle: toIndicatorCandle(last),
  }).readings;
  const signal = signalStep({ strategy, market: run.parameters, state, candle: last }).signal;
  const triggers = api.computeNextTriggers({
    config: strategy.config,
    readings,
    close: last.close,
    closeTime: last.closeTime,
    sentiment: undefined,
    sentimentSource: run.parameters.sentimentSource,
    state: 'awaiting_entry',
  });
  return { signal, triggers };
}

describe('a situação no último candle fechado: sinal e próximos gatilhos', () => {
  test.each([
    ['ETH diário inteiro', ethDaily, 400],
    ['ETH diário até o candle 300', ethDaily, 300],
    ['BTC de 1 hora inteiro', btcHourly, 500],
  ])('%s', (_name, scenario, count) => {
    const candles = scenario.candles.slice(0, count);
    const latest = api.computeLatestTriggers({
      strategy: scenario.strategy,
      run: scenario.run,
      candles,
      sentiments: undefined,
      state: 'awaiting_entry',
    });
    const reference = referenceFor({ scenario, candles });
    expect(latest).not.toBeNull();
    expect(latest?.signal ?? null).toStrictEqual(reference.signal);
    expect(latest?.triggers.state).toBe('awaiting_entry');
    expect(latest?.triggers).toStrictEqual(reference.triggers);
    expect(latest?.triggers.rules.map((rule) => rule.ruleId)).toStrictEqual(
      scenario.strategy.config.rules.map((rule) => rule.id),
    );
    expect(latest?.triggers.rules.every((rule) => rule.current !== null)).toBe(true);
  });

  test('o estado comprado olha o limiar de venda, o aguardando olha o de compra', () => {
    const candles = ethDaily.candles;
    const request = {
      strategy: ethDaily.strategy,
      run: ethDaily.run,
      candles,
      sentiments: undefined,
    };
    const waiting = api.computeLatestTriggers({ ...request, state: 'awaiting_entry' });
    const holding = api.computeLatestTriggers({ ...request, state: 'holding' });
    expect(waiting?.triggers.scoreThreshold).toBe(ethDaily.strategy.config.thresholds.buy);
    expect(holding?.triggers.scoreThreshold).toBe(ethDaily.strategy.config.thresholds.sell);
    expect(holding?.signal ?? null).toStrictEqual(waiting?.signal ?? null);
  });

  test('ainda aquecendo (menos candles que o necessário): sem sinal e sem gatilhos', () => {
    const latest = api.computeLatestTriggers({
      strategy: ethDaily.strategy,
      run: ethDaily.run,
      candles: ethDaily.candles.slice(0, 30),
      sentiments: undefined,
      state: 'awaiting_entry',
    });
    expect(latest).toBeNull();
  });

  test('série vazia: nada', () => {
    expect(
      api.computeLatestTriggers({
        strategy: ethDaily.strategy,
        run: ethDaily.run,
        candles: [],
        sentiments: undefined,
        state: 'awaiting_entry',
      }),
    ).toBeNull();
  });

  test('com Fear & Greed: o índice do último candle aparece como valor atual da regra de sentimento', () => {
    const scenario = sentimentScenario({ seed: 8, count: 300 });
    const latest = api.computeLatestTriggers({
      strategy: scenario.strategy,
      run: scenario.run,
      candles: scenario.candles,
      sentiments: scenario.sentiments,
      state: 'awaiting_entry',
    });
    const last = scenario.sentiments?.at(-1);
    const rule = latest?.triggers.rules.find((entry) => entry.kind === 'fear_greed');
    expect(rule?.current).toBe(String(last?.value));
  });

  test('é determinística', () => {
    const request = {
      strategy: ethDaily.strategy,
      run: ethDaily.run,
      candles: ethDaily.candles,
      sentiments: undefined,
      state: 'holding' as const,
    };
    expect(api.computeLatestTriggers(request)).toStrictEqual(api.computeLatestTriggers(request));
  });
});
