// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createStrategyVersion,
  ENGINE_TIMEFRAME,
  EngineDecimal,
  type EngineCandle,
  type StrategyConfigInput,
  type StrategyVersion,
} from '../../../../packages/strategy-engine/src/index.js';
import { ENGINE_EVENT_KIND, type EngineScenario } from '../engine-contract-types.fixture.js';
import {
  buildReferenceRun,
  command,
  commandsByIndex,
  FIRST_OPEN_TIME,
  HOUR,
  observation,
  SCENARIO_SYMBOL,
} from '../engine-scenarios.fixture.js';
import { createRandom } from '../risk/risk-grid.fixture.js';
import { CLASSIC_STRATEGY, REAL_DATASETS } from '../signal/classic-signals.fixture.js';

// Cenários do motor COMPLETO de produção: o sinal é o placar de verdade (indicadores curtos para o
// pré-aquecimento caber em poucas dezenas de candles) e os candles vêm de um passeio aleatório com
// semente fixa. O que cada cenário promete (`requiredEvents`) é conferido pelo harness.
const PRICE_TICKS_BASE = 10_000;
const PERCENT = 100;
const PER_MILLE = 1_000;
const TICK = '0.01';

export type CandleShape = {
  readonly seed: number;
  readonly length: number;
  readonly volatilityPerMille: number;
  readonly gapPercent: number;
  readonly smallVolumePercent: number;
};

export type FastStrategyOptions = {
  readonly entry: NonNullable<StrategyConfigInput['entry']>;
  readonly risk: NonNullable<StrategyConfigInput['risk']>;
  readonly hasSentimentRule: boolean;
};

const FAST_RULES: StrategyConfigInput['rules'] = [
  { id: 'ema-2-3', kind: 'ema_cross', fastPeriod: 2, slowPeriod: 3 },
  { id: 'rsi-2', kind: 'rsi', period: 2, oversold: 30, overbought: 70 },
];
const SENTIMENT_RULE = {
  id: 'fear-greed',
  kind: 'fear_greed',
  fearAtOrBelow: 25,
  greedAtOrAbove: 75,
} as const;

export function buildFastStrategy(options: FastStrategyOptions): StrategyVersion {
  const rules = options.hasSentimentRule ? [...FAST_RULES, SENTIMENT_RULE] : FAST_RULES;
  return createStrategyVersion({
    schemaVersion: 1,
    rules,
    regime: { kind: 'none' },
    thresholds: { buy: '1', sell: '-1' },
    entry: options.entry,
    risk: options.risk,
  });
}

function text(ticks: number): string {
  return new EngineDecimal(ticks).times(TICK).toFixed();
}

function volumeOf(random: (limit: number) => number, smallVolumePercent: number): string {
  if (random(PERCENT) < smallVolumePercent) return new EngineDecimal(1 + random(40)).toFixed();
  return '100000';
}

export function buildRandomWalk(shape: CandleShape): EngineCandle[] {
  const random = createRandom(shape.seed);
  const candles: EngineCandle[] = [];
  let close = PRICE_TICKS_BASE;
  for (let index = 0; index < shape.length; index += 1) {
    const hasGap = index > 0 && random(PERCENT) < shape.gapPercent;
    const gapTicks = hasGap ? Math.round((close * (random(9) - 4)) / PERCENT) : 0;
    const open = Math.max(2, close + gapTicks);
    const spread = Math.max(1, Math.floor((open * shape.volatilityPerMille) / PER_MILLE));
    close = Math.max(1, open + random(2 * spread + 1) - spread);
    const high = Math.max(open, close) + random(spread + 1);
    const low = Math.max(1, Math.min(open, close) - random(spread + 1));
    const openTime = FIRST_OPEN_TIME + index * HOUR;
    candles.push({
      symbol: SCENARIO_SYMBOL,
      timeframe: ENGINE_TIMEFRAME.ONE_HOUR,
      openTime,
      closeTime: openTime + HOUR - 1,
      open: text(open),
      high: text(high),
      low: text(low),
      close: text(close),
      volume: volumeOf(random, shape.smallVolumePercent),
    });
  }
  return candles;
}

export type SyntheticScenarioParams = Pick<
  EngineScenario,
  'name' | 'requiredEvents' | 'sentiment' | 'commands'
> & {
  readonly shape: CandleShape;
  readonly strategy: FastStrategyOptions;
};

export function buildSyntheticScenario(params: SyntheticScenarioParams): EngineScenario {
  return {
    name: params.name,
    strategy: buildFastStrategy(params.strategy),
    run: buildReferenceRun(),
    candles: buildRandomWalk(params.shape),
    sentiment: params.sentiment,
    commands: params.commands,
    requiredEvents: params.requiredEvents,
  };
}

const FAST_RISK: FastStrategyOptions['risk'] = {
  atrPeriod: 3,
  stopAtrMultiple: '1.5',
  targetAtrMultiple: '2.5',
  riskPerTrade: '0.05',
  maxExposureRate: '1',
};
const MARKET_ENTRY_CONFIG: FastStrategyOptions['entry'] = { orderType: 'market' };
const LIMIT_ENTRY_CONFIG: FastStrategyOptions['entry'] = {
  orderType: 'limit',
  offsetRate: '0.003',
  expiryCandles: 2,
};
const SCENARIO_LENGTH = 70;

function shapeOf(seed: number): CandleShape {
  return {
    seed,
    length: SCENARIO_LENGTH,
    volatilityPerMille: 25,
    gapPercent: 25,
    smallVolumePercent: 6,
  };
}

function marketStrategy(hasSentimentRule = false): FastStrategyOptions {
  return { entry: MARKET_ENTRY_CONFIG, risk: FAST_RISK, hasSentimentRule };
}

function limitStrategy(hasSentimentRule = false): FastStrategyOptions {
  return { entry: LIMIT_ENTRY_CONFIG, risk: FAST_RISK, hasSentimentRule };
}

const NO_SENTIMENT: EngineScenario['sentiment'] = [];
const NO_COMMANDS: EngineScenario['commands'] = {};

// Sentimento só até o candle 14: do 63º em diante a última observação passa de 48 h e vira dado ausente.
// Medo (≤ 25) vota a favor da compra, então a carteira entra o bastante para os comandos agirem.
const SENTIMENT_SERIES = [observation(5, 50), observation(12, 20), observation(14, 22)];
const COMMAND_SERIES = commandsByIndex([
  [22, [command(22, 'halt', 'user_stop')]],
  [40, [command(40, 'resume', 'user_resume')]],
  ...[44, 47, 50, 53, 56, 59, 62].map(
    (index) => [index, [command(index, 'exit_position', 'goal_reached')]] as const,
  ),
]);

// Cada cenário promete o que de fato acontece com o placar de verdade; o harness reprova se deixar de ocorrer.
export function buildProductionScenarios(): EngineScenario[] {
  const kind = ENGINE_EVENT_KIND;
  return [
    buildSyntheticScenario({
      name: 'fast-market-gap-up-entry-stop-gap-and-volume-cap',
      shape: shapeOf(19),
      strategy: marketStrategy(),
      sentiment: NO_SENTIMENT,
      commands: NO_COMMANDS,
      requiredEvents: [
        kind.MARKET_ENTRY_FILL,
        kind.GAP_UP_ENTRY,
        kind.STOP_EXIT_ON_GAP,
        kind.TARGET_EXIT,
        kind.SELL_EXITS_AT_MARKET,
        kind.BUY_SIGNAL_WHILE_POSITION_OPEN,
        kind.VOLUME_CAPPED_FILL,
      ],
    }),
    buildSyntheticScenario({
      name: 'fast-market-target-gap-and-stop',
      shape: shapeOf(20),
      strategy: marketStrategy(),
      sentiment: NO_SENTIMENT,
      commands: NO_COMMANDS,
      requiredEvents: [
        kind.MARKET_ENTRY_FILL,
        kind.TARGET_EXIT,
        kind.TARGET_EXIT_ON_GAP,
        kind.STOP_EXIT_WITHOUT_GAP,
      ],
    }),
    buildSyntheticScenario({
      name: 'fast-market-cash-bound-stop-with-and-without-gap',
      shape: shapeOf(14),
      strategy: marketStrategy(),
      sentiment: NO_SENTIMENT,
      commands: NO_COMMANDS,
      requiredEvents: [
        kind.CASH_BOUND_ENTRY,
        kind.STOP_EXIT_ON_GAP,
        kind.STOP_EXIT_WITHOUT_GAP,
        kind.SELL_EXITS_AT_MARKET,
      ],
    }),
    buildSyntheticScenario({
      name: 'fast-limit-open-fill-intra-candle-expiry-and-target-gap',
      shape: shapeOf(17),
      strategy: limitStrategy(),
      sentiment: NO_SENTIMENT,
      commands: NO_COMMANDS,
      requiredEvents: [
        kind.LIMIT_ENTRY_FILL_AT_OPEN,
        kind.LIMIT_ENTRY_FILL_INTRA_CANDLE,
        kind.LIMIT_EXPIRED,
        kind.TARGET_EXIT_ON_GAP,
        kind.CASH_BOUND_ENTRY,
      ],
    }),
    buildSyntheticScenario({
      name: 'fast-limit-sell-cancels-the-live-entry',
      shape: shapeOf(9),
      strategy: limitStrategy(),
      sentiment: NO_SENTIMENT,
      commands: NO_COMMANDS,
      requiredEvents: [kind.SELL_CANCELS_LIMIT, kind.TARGET_EXIT, kind.VOLUME_CAPPED_FILL],
    }),
    buildSyntheticScenario({
      name: 'fast-limit-commands-and-sentiment',
      shape: shapeOf(24),
      strategy: limitStrategy(true),
      sentiment: SENTIMENT_SERIES,
      commands: COMMAND_SERIES,
      requiredEvents: [
        kind.HALT_BLOCKS_ENTRY,
        kind.RESUME_AFTER_HALT,
        kind.COMMAND_EXIT,
        kind.SENTIMENT_USED,
        kind.SENTIMENT_STALE,
      ],
    }),
    ...buildClassicScenarios(),
  ];
}

// Quantos candles de cada conjunto: o suficiente para o placar abrir e fechar operações de todo tipo.
const CLASSIC_CANDLES: Readonly<Record<string, number>> = {
  'BTCUSDT 1h × 500': 400,
  'ETHUSDT 1d × 400': 330,
};

// O Placar clássico de verdade sobre os dois conjuntos REAIS: pré-aquecimento de 194 candles e depois
// as operações que o placar decide (nenhuma regra de cenário escrita para o motor).
function buildClassicScenarios(): EngineScenario[] {
  const kind = ENGINE_EVENT_KIND;
  return REAL_DATASETS.map((dataset) => ({
    name: `classic-scoreboard-${dataset.name}`,
    strategy: CLASSIC_STRATEGY,
    run: buildReferenceRun({ symbol: dataset.market.symbol, timeframe: dataset.market.timeframe }),
    candles: dataset.candles.slice(0, CLASSIC_CANDLES[dataset.name]),
    sentiment: NO_SENTIMENT,
    commands: NO_COMMANDS,
    requiredEvents: [
      kind.MARKET_ENTRY_FILL,
      kind.STOP_EXIT_WITHOUT_GAP,
      kind.TARGET_EXIT,
      kind.SELL_EXITS_AT_MARKET,
      kind.BUY_SIGNAL_WHILE_POSITION_OPEN,
    ],
  }));
}
