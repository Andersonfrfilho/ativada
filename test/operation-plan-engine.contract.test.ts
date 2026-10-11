// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  computeStrategyLeadInCandles,
  createStrategySignalState,
  createStrategyVersion,
  EngineDecimal,
  type EngineDecimalValue,
  signalStep,
  type EngineCandle,
  type SentimentObservation,
  type SignalDecision,
  type RunSetup,
  type SignalState,
  type StrategyVersion,
} from '../packages/strategy-engine/src/index.js';
import { buildSyntheticCandles } from './fixtures/backtest/synthetic-candles.fixture.js';
import {
  buildReferenceRun,
  loadClassicScoreboard,
} from './fixtures/strategy-engine/engine-scenarios.fixture.js';
import { loadPlanApi } from './fixtures/strategy-engine/plan/plan-api.fixture.js';

const api = await loadPlanApi();
const RUN = buildReferenceRun({ symbol: 'BTCUSDT', timeframe: '1h' });
const TICK_CENTS = new EngineDecimal('0.01');
const HOUR = 3_600_000;
const DAY = 86_400_000;
const GOAL = { targetRate: '0.03', maxLossRate: '0.05', horizonDays: 30 } as const;
const CANDLES = buildSyntheticCandles({
  count: 400,
  seed: 77,
  firstOpenTime: Date.UTC(2024, 0, 1),
});
const SAMPLE_EVERY = 6;
const THRESHOLDS = { buy: '1', sell: '-1' } as const;

function singleRule(rule: Record<string, unknown>): StrategyVersion {
  return createStrategyVersion({ schemaVersion: 1, rules: [rule], thresholds: THRESHOLDS });
}

const EMA_ONLY = singleRule({ id: 'ema-5-12', kind: 'ema_cross', fastPeriod: 5, slowPeriod: 12 });
const BREAKOUT_ONLY = singleRule({ id: 'donchian-20', kind: 'donchian_breakout', period: 20 });
const RSI_ONLY = singleRule({
  id: 'rsi-14',
  kind: 'rsi',
  period: 14,
  oversold: 30,
  overbought: 70,
});
const BOLLINGER_ONLY = singleRule({
  id: 'bollinger-20',
  kind: 'bollinger',
  period: 20,
  deviations: '2',
});
const CLASSIC = createStrategyVersion(loadClassicScoreboard());

type Sample = {
  readonly index: number;
  readonly state: SignalState;
  readonly signal: SignalDecision;
  readonly sentiment: SentimentObservation | undefined;
};

// O estado do sinal e a decisão em cada candle amostrado, numa única passagem pela série.
function collectSamples(
  strategy: StrategyVersion,
  sentiments?: readonly SentimentObservation[],
): readonly Sample[] {
  const leadIn = computeStrategyLeadInCandles(strategy.config);
  let state = createStrategySignalState(strategy.config);
  const samples: Sample[] = [];
  CANDLES.forEach((candle, index) => {
    const sentiment = sentiments?.[index];
    const result = signalStep({ strategy, market: RUN.parameters, state, candle, sentiment });
    state = result.state;
    const isSampled = index >= leadIn && (index - leadIn) % SAMPLE_EVERY === 0;
    if (isSampled && result.signal !== null && index < CANDLES.length - 1) {
      samples.push({ index, state, signal: result.signal, sentiment });
    }
  });
  return samples;
}

// O candle seguinte que o plano pressupõe, montado AQUI e não pelo código sob teste: abre no último fechamento, a
// máxima e a mínima são as pontas entre abertura e fechamento, e o volume repete o do último candle.
function nextCandle(last: EngineCandle, closeText: string): EngineCandle {
  const open = new EngineDecimal(last.close);
  const close = new EngineDecimal(closeText);
  return {
    symbol: last.symbol,
    timeframe: last.timeframe,
    openTime: last.openTime + HOUR,
    closeTime: last.closeTime + HOUR,
    open: last.close,
    high: EngineDecimal.max(open, close).toFixed(),
    low: EngineDecimal.min(open, close).toFixed(),
    close: closeText,
    volume: last.volume,
  };
}

function decide(params: {
  readonly strategy: StrategyVersion;
  readonly sample: Sample;
  readonly closeText: string;
}): SignalDecision {
  const { strategy, sample } = params;
  const last = CANDLES[sample.index] as EngineCandle;
  const result = signalStep({
    strategy,
    market: RUN.parameters,
    state: sample.state,
    candle: nextCandle(last, params.closeText),
    sentiment: sample.sentiment,
  });
  if (result.signal === null) throw new Error('plano sem sinal no candle seguinte');
  return result.signal;
}

function planFor(
  strategy: StrategyVersion,
  sample: Sample,
  run: RunSetup = RUN,
): ReturnType<typeof api.computeOperationPlan> {
  return api.computeOperationPlan({
    strategy,
    run,
    state: sample.state,
    last: CANDLES[sample.index] as EngineCandle,
    signal: sample.signal,
    sentiment: sample.sentiment,
    goal: GOAL,
  });
}

type Level = ReturnType<typeof planFor>['buy'];
type Tally = { price: number; active: number; unreachable: number };

// Um tick do lado oposto ao disparo: a vizinha da grade que NÃO pode disparar.
function neighborToward(level: Level, tick: EngineDecimalValue): string {
  const price = new EngineDecimal(level.price as string);
  return (level.trigger === 'at_or_above' ? price.minus(tick) : price.plus(tick)).toFixed();
}

function canonical(text: string): string {
  return new EngineDecimal(text).toFixed();
}

function expectLevel(params: {
  readonly level: Level;
  readonly lastClose: string;
  readonly fires: (closeText: string) => boolean;
  readonly alreadyFires: boolean;
  readonly tally: Tally;
  readonly tick: EngineDecimalValue;
}): void {
  const { level, tally, tick } = params;
  if (level.status === 'already_active') {
    tally.active += 1;
    expect(params.alreadyFires).toBe(true);
    expect(level.price).toBe(canonical(params.lastClose));
    return;
  }
  expect(params.alreadyFires).toBe(false);
  if (level.status === 'unreachable') {
    tally.unreachable += 1;
    expect(level.price).toBeNull();
    return;
  }
  tally.price += 1;
  const price = new EngineDecimal(level.price as string);
  expect(price.mod(tick).isZero()).toBe(true);
  expect(params.fires(price.toFixed())).toBe(true);
  expect(params.fires(neighborToward(level, tick))).toBe(false);
}

function checkStrategy(
  strategy: StrategyVersion,
  run: RunSetup = RUN,
): {
  readonly buy: Tally;
  readonly exit: Tally;
} {
  const tick = new EngineDecimal(run.parameters.tickSize);
  const buy: Tally = { price: 0, active: 0, unreachable: 0 };
  const exit: Tally = { price: 0, active: 0, unreachable: 0 };
  for (const sample of collectSamples(strategy)) {
    const plan = planFor(strategy, sample, run);
    if (plan === null) throw new Error('plano nulo depois do aquecimento');
    const lastClose = (CANDLES[sample.index] as EngineCandle).close;
    const actionAt = (closeText: string): string => decide({ strategy, sample, closeText }).action;
    expectLevel({
      level: plan.buy,
      lastClose,
      fires: (closeText) => actionAt(closeText) === 'BUY',
      alreadyFires: sample.signal.action === 'BUY',
      tally: buy,
      tick,
    });
    expectLevel({
      level: plan.exit,
      lastClose,
      fires: (closeText) => actionAt(closeText) === 'SELL',
      alreadyFires: sample.signal.action === 'SELL',
      tally: exit,
      tick,
    });
  }
  return { buy, exit };
}

describe('o fechamento calculado dispara EXATAMENTE a regra no motor de produção (compra e saída)', () => {
  test.each([
    ['cruzamento de médias (EMA 5×12)', EMA_ONLY],
    ['rompimento de Donchian (20)', BREAKOUT_ONLY],
    ['RSI (14, 30/70)', RSI_ONLY],
    ['Bandas de Bollinger (20, 2)', BOLLINGER_ONLY],
  ])(
    '%s: no preço o placar sinaliza e um tick para o lado do fechamento não',
    (_name, strategy) => {
      const { buy, exit } = checkStrategy(strategy);
      expect(buy.price).toBeGreaterThan(15);
      expect(exit.price).toBeGreaterThan(15);
      expect(buy.active + buy.price + buy.unreachable).toBe(
        exit.active + exit.price + exit.unreachable,
      );
    },
  );

  test('o Placar clássico (várias regras, regime ADX): o mesmo vale para o placar inteiro', () => {
    const { buy, exit } = checkStrategy(CLASSIC);
    expect(buy.price + exit.price).toBeGreaterThan(10);
  });
  test.each(['0.05', '1'])(
    'com o tick de %s a grade é outra, e o preço continua no tick exato (EMA, rompimento e RSI)',
    (tickSize) => {
      const run = buildReferenceRun({ symbol: 'BTCUSDT', timeframe: '1h', tickSize });
      for (const strategy of [EMA_ONLY, BREAKOUT_ONLY, RSI_ONLY]) {
        const { buy, exit } = checkStrategy(strategy, run);
        expect(buy.price).toBeGreaterThan(15);
        expect(exit.price).toBeGreaterThan(15);
      }
    },
  );
});

describe('o sentimento entra na busca do mesmo jeito que entra no sinal', () => {
  const EMA_AND_FEAR = createStrategyVersion({
    schemaVersion: 1,
    rules: [
      { id: 'ema-5-12', kind: 'ema_cross', fastPeriod: 5, slowPeriod: 12 },
      { id: 'fear-25-75', kind: 'fear_greed', fearAtOrBelow: 25, greedAtOrAbove: 75 },
    ],
    thresholds: { buy: '2', sell: '-2' },
  });
  const FEAR: readonly SentimentObservation[] = CANDLES.map((candle) => ({
    value: 10,
    observedAt: candle.openTime,
    source: RUN.parameters.sentimentSource,
  }));

  test('computeLatestPlan alinha o sentimento ao candle: o mesmo plano da amostra', () => {
    for (const sample of collectSamples(EMA_AND_FEAR, FEAR).slice(0, 12)) {
      const latest = api.computeLatestPlan({
        strategy: EMA_AND_FEAR,
        run: RUN,
        candles: CANDLES.slice(0, sample.index + 1),
        sentiments: FEAR,
        goal: GOAL,
      });
      expect(latest).toStrictEqual(planFor(EMA_AND_FEAR, sample));
    }
  });

  test('com medo, só falta a EMA para a compra (o preço existe e dispara); a venda é inalcançável', () => {
    let priced = 0;
    for (const sample of collectSamples(EMA_AND_FEAR, FEAR)) {
      const plan = planFor(EMA_AND_FEAR, sample);
      expect(plan?.exit.status).toBe('unreachable');
      if (plan?.buy.status !== 'price') continue;
      priced += 1;
      const buyAt = (closeText: string): string =>
        decide({ strategy: EMA_AND_FEAR, sample, closeText }).action;
      expect(buyAt(plan.buy.price as string)).toBe('BUY');
      expect(buyAt(neighborToward(plan.buy, TICK_CENTS))).not.toBe('BUY');
    }
    expect(priced).toBeGreaterThan(15);
  });
});

describe('a base do plano com o filtro de regime', () => {
  test('só o filtro ADX, sem OBV, já torna o plano indicativo', () => {
    const adxOnly = createStrategyVersion({
      ...loadClassicScoreboard(),
      rules: [{ id: 'ema-5-12', kind: 'ema_cross', fastPeriod: 5, slowPeriod: 12 }],
    });
    const sample = collectSamples(adxOnly)[0] as Sample;
    expect(planFor(adxOnly, sample)?.basis).toBe('indicative');
    expect(planFor(adxOnly, sample)?.rules[0]?.basis).toBe('exact');
  });
});

describe('o preço de cada regra do placar dispara o voto dela (por família)', () => {
  test('no Placar clássico, o voto de cada regra vira no preço e não um tick antes', () => {
    let checked = 0;
    for (const sample of collectSamples(CLASSIC)) {
      const plan = planFor(CLASSIC, sample);
      if (plan === null) throw new Error('plano nulo depois do aquecimento');
      expect(plan.rules.map((rule) => rule.ruleId)).toStrictEqual(
        CLASSIC.config.rules.map((rule) => rule.id),
      );
      plan.rules.forEach((rule, index) => {
        const voteAt = (closeText: string): number | undefined =>
          decide({ strategy: CLASSIC, sample, closeText }).votes[index]?.vote;
        for (const [level, wanted] of [
          [rule.buy, 1],
          [rule.exit, -1],
        ] as const) {
          if (level.status === 'already_active') {
            expect(sample.signal.votes[index]?.vote).toBe(wanted);
          }
          if (level.status !== 'price') continue;
          checked += 1;
          expect(voteAt(level.price as string)).toBe(wanted);
          expect(voteAt(neighborToward(level, TICK_CENTS))).not.toBe(wanted);
        }
      });
    }
    expect(checked).toBeGreaterThan(100);
  });

  test('a regra de uma estratégia de regra única tem o mesmo preço do plano', () => {
    for (const strategy of [EMA_ONLY, BREAKOUT_ONLY, RSI_ONLY]) {
      for (const sample of collectSamples(strategy).slice(0, 20)) {
        const plan = planFor(strategy, sample);
        expect(plan?.rules).toHaveLength(1);
        expect(plan?.rules[0]?.buy).toStrictEqual(plan.buy);
        expect(plan?.rules[0]?.exit).toStrictEqual(plan?.exit);
      }
    }
  });

  test('a base: exata quando só o fechamento importa, indicativa com OBV ou regime ADX', () => {
    const sample = collectSamples(EMA_ONLY)[0] as Sample;
    expect(planFor(EMA_ONLY, sample)?.basis).toBe('exact');
    expect(planFor(EMA_ONLY, sample)?.rules[0]?.basis).toBe('exact');
    const classic = collectSamples(CLASSIC)[0] as Sample;
    const classicPlan = planFor(CLASSIC, classic);
    expect(classicPlan?.basis).toBe('indicative');
    expect(classicPlan?.rules.map((rule) => [rule.kind, rule.family, rule.basis])).toStrictEqual([
      ['ema_cross', 'trend', 'exact'],
      ['macd', 'trend', 'exact'],
      ['rsi', 'reversion', 'exact'],
      ['obv_trend', 'volume', 'indicative'],
    ]);
    const obvOnly = singleRule({ id: 'obv-20', kind: 'obv_trend', emaPeriod: 20 });
    const obvSample = collectSamples(obvOnly)[0] as Sample;
    expect(planFor(obvOnly, obvSample)?.basis).toBe('indicative');
  });
});

describe('o resto do plano: distância, alvo, stop, prazo e determinismo', () => {
  // Preguiçoso: um defeito na busca deve reprovar os testes, não derrubar o carregamento do arquivo.
  let cached:
    { sample: Sample; plan: ReturnType<typeof planFor>; lastClose: EngineDecimalValue } | undefined;
  function context(): NonNullable<typeof cached> {
    if (cached !== undefined) return cached;
    const sample = collectSamples(EMA_ONLY).find(
      (candidate) => planFor(EMA_ONLY, candidate)?.buy.status === 'price',
    ) as Sample;
    cached = {
      sample,
      plan: planFor(EMA_ONLY, sample),
      lastClose: new EngineDecimal((CANDLES[sample.index] as EngineCandle).close),
    };
    return cached;
  }

  test('a distância é absoluta até o último fechamento e a direção diz o lado', () => {
    const { plan, lastClose } = context();
    const level = plan?.buy;
    const price = new EngineDecimal(level.price as string);
    expect(level.direction).toBe(price.greaterThan(lastClose) ? 'above' : 'below');
    expect(level.distance).toBe(price.minus(lastClose).abs().toFixed());
    const rate = price
      .minus(lastClose)
      .abs()
      .dividedBy(lastClose)
      .toDecimalPlaces(8, EngineDecimal.ROUND_CEIL);
    expect(level.distanceRate).toBe(rate.toFixed());
  });

  test('alvo e stop partem do preço de compra, com as contas do motor', () => {
    const { plan } = context();
    const expected = api.computePlanLevels({
      entry: new EngineDecimal(plan.buy.price as string),
      parameters: RUN.parameters,
      goal: GOAL,
    });
    expect(plan?.entryReference).toBe(plan.buy.price);
    expect(plan?.target).toStrictEqual(expected.target);
    expect(plan?.stop).toStrictEqual(expected.stop);
  });

  test('com o sinal já ativo, alvo e stop partem do último fechamento', () => {
    const active = collectSamples(EMA_ONLY).find(
      (candidate) => planFor(EMA_ONLY, candidate)?.buy.status === 'already_active',
    ) as Sample;
    const activePlan = planFor(EMA_ONLY, active);
    const close = (CANDLES[active.index] as EngineCandle).close;
    expect(activePlan?.buy).toStrictEqual({
      status: 'already_active',
      price: canonical(close),
      trigger: null,
      direction: null,
      distance: '0',
      distanceRate: '0',
    });
    expect(activePlan?.entryReference).toBe(canonical(close));
    expect(activePlan?.target?.price).toBe(
      api.computePlanLevels({
        entry: new EngineDecimal(close),
        parameters: RUN.parameters,
        goal: GOAL,
      }).target.price,
    );
  });

  test('o prazo conta do fechamento do último candle, em dias corridos', () => {
    const { sample, plan } = context();
    const last = CANDLES[sample.index] as EngineCandle;
    expect(plan?.lastCloseTime).toBe(last.closeTime);
    expect(plan?.startsAt).toBe(last.closeTime + 1);
    expect(plan?.deadlineAt).toBe(last.closeTime + 1 + 30 * DAY);
    expect(plan?.horizonDays).toBe(30);
    expect(plan?.version).toBe('plan-1');
    expect(plan?.lastClose).toBe(canonical(last.close));
    expect(plan?.signal).toStrictEqual({
      action: sample.signal.action,
      score: sample.signal.score,
    });
  });

  test('determinístico, e nunca altera o estado recebido', () => {
    const { sample } = context();
    const before = JSON.stringify(sample.state);
    expect(planFor(EMA_ONLY, sample)).toStrictEqual(planFor(EMA_ONLY, sample));
    expect(JSON.stringify(sample.state)).toBe(before);
  });

  test('computeLatestPlan refaz o sinal da série e dá o mesmo plano', () => {
    const { sample, plan } = context();
    const upTo = sample.index + 1;
    const latest = api.computeLatestPlan({
      strategy: EMA_ONLY,
      run: RUN,
      candles: CANDLES.slice(0, upTo),
      sentiments: undefined,
      goal: GOAL,
    });
    expect(latest).toStrictEqual(plan);
  });

  test('série vazia ou ainda no aquecimento não tem plano', () => {
    const leadIn = computeStrategyLeadInCandles(EMA_ONLY.config);
    const base = { strategy: EMA_ONLY, run: RUN, sentiments: undefined, goal: GOAL };
    expect(api.computeLatestPlan({ ...base, candles: [] })).toBeNull();
    expect(api.computeLatestPlan({ ...base, candles: CANDLES.slice(0, leadIn - 1) })).toBeNull();
    expect(api.computeLatestPlan({ ...base, candles: CANDLES.slice(0, leadIn) })).not.toBeNull();
  });

  test('meta inválida é recusada, não calculada', () => {
    const attempt = (): unknown =>
      api.computeLatestPlan({
        strategy: EMA_ONLY,
        run: RUN,
        candles: CANDLES.slice(0, 100),
        sentiments: undefined,
        goal: { targetRate: '0', maxLossRate: '0.05', horizonDays: 30 },
      });
    expect(attempt).toThrow();
  });
});

describe('regra que o preço não move', () => {
  const FEAR_ONLY = singleRule({
    id: 'fear-25-75',
    kind: 'fear_greed',
    fearAtOrBelow: 25,
    greedAtOrAbove: 75,
  });

  function sentimentsOf(value: number): SentimentObservation[] {
    return CANDLES.map((candle) => ({
      value,
      observedAt: candle.openTime,
      source: RUN.parameters.sentimentSource,
    }));
  }

  function latestWith(value: number): ReturnType<typeof api.computeLatestPlan> {
    return api.computeLatestPlan({
      strategy: FEAR_ONLY,
      run: RUN,
      candles: CANDLES.slice(0, 120),
      sentiments: sentimentsOf(value).slice(0, 120),
      goal: GOAL,
    });
  }

  test('medo neutro: nem a compra nem a saída são alcançáveis por preço', () => {
    const neutral = latestWith(50);
    const unreachable = {
      status: 'unreachable' as const,
      price: null,
      trigger: null,
      direction: null,
      distance: null,
      distanceRate: null,
    };
    expect(neutral?.buy).toStrictEqual(unreachable);
    expect(neutral?.exit).toStrictEqual(unreachable);
    expect(neutral?.entryReference).toBeNull();
    expect(neutral?.target).toBeNull();
    expect(neutral?.stop).toBeNull();
  });

  test('meta inválida é recusada mesmo quando não há preço de compra', () => {
    const attempt = (): unknown =>
      api.computeLatestPlan({
        strategy: FEAR_ONLY,
        run: RUN,
        candles: CANDLES.slice(0, 120),
        sentiments: sentimentsOf(50).slice(0, 120),
        goal: { targetRate: '0.03', maxLossRate: '0.05', horizonDays: 0 },
      });
    expect(attempt).toThrow();
  });

  test('medo extremo: o sinal de compra já está ativo, e a saída segue inalcançável', () => {
    const fearful = latestWith(10);
    expect(fearful?.buy.status).toBe('already_active');
    expect(fearful?.exit.status).toBe('unreachable');
    expect(fearful?.entryReference).toBe(canonical((CANDLES[119] as EngineCandle).close));
  });
});
