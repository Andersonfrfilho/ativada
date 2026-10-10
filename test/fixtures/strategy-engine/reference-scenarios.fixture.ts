// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ENGINE_EVENT_KIND, type EngineScenario } from './engine-contract-types.fixture.js';
import {
  buildCandles,
  buildCandlesWithGaps,
  buildReferenceStrategy,
  command,
  commandsByIndex,
  LIMIT_ENTRY,
  LIMIT_SCENARIO_PRICES,
  MARKET_ENTRY,
  MARKET_SCENARIO_PRICES,
  observation,
  QUIET_CANDLE,
  scenario,
  type CandleSpec,
} from './engine-scenarios.fixture.js';

const QUIET: CandleSpec = QUIET_CANDLE;
const FLAT: CandleSpec = ['100', '100', '100', '100'];
const NARROW: CandleSpec = ['100', '100.01', '100', '100'];

// Limitada (3 candles): SELL cancela a entrada viva, SELL vende a posição, halt cancela e bloqueia,
// resume volta a entrar, exit_position vende; sentimento velho (ausente) e fresco (ganância segura).
export const SELL_AND_COMMANDS_PRICES: readonly CandleSpec[] = [
  QUIET,
  QUIET,
  QUIET,
  ['103', '103', '99.5', '99.8'],
  ['100', '101', '99.5', '100'],
  ['100', '101', '98.5', '100'],
  QUIET,
  ['101', '101.5', '97.5', '97.9'],
  ['98', '99', '97.8', '98.5'],
  ['98.5', '99', '98', '98.5'],
  ['98.5', '99', '98', '98.5'],
  ['98.5', '99', '98', '98.5'],
  ['98.5', '99', '98', '98.5'],
  ['98.5', '99', '96', '98.5'],
  ['98.5', '99', '98', '98.5'],
  ['98.5', '99', '98', '98.5'],
  ['98.5', '99', '98', '98.5'],
];

// Mercado: ATR zero, stop inválido (ATR menor que o slippage), volume que não paga o mínimo,
// volume que limita a quantidade. O volume que vale é o do candle de DECISÃO (`t`), nunca o do
// candle de preenchimento: decide em 5 (volume 0,01) e em 6 (volume 30); o preenchimento tem volume alto.
export const REJECTIONS_PRICES: readonly CandleSpec[] = [
  FLAT,
  FLAT,
  FLAT,
  NARROW,
  NARROW,
  ['100', '104', '96', '100', '0.01'],
  ['100', '101', '99', '100', '30'],
  QUIET,
  QUIET,
];

// Limitada (2 candles): mínima só toca o limite, abertura abaixo do limite no 2º candle, máxima só
// toca o alvo, gap acima do alvo, limitada no meio do candle com a máxima além do alvo.
export const EDGE_FILLS_PRICES: readonly CandleSpec[] = [
  QUIET,
  QUIET,
  QUIET,
  ['100', '101', '99', '100'],
  ['98.5', '100', '98', '99.5'],
  ['100', '105', '99', '104'],
  ['106', '107', '105.5', '106'],
  ['106', '117', '104', '116'],
  ['116', '117', '115', '116'],
];

// Mercado com risco alto e stop curto: o caixa (com a taxa) limita a quantidade.
const TIGHT: CandleSpec = ['100', '100.5', '99.5', '100'];
export const CASH_BOUND_PRICES: readonly CandleSpec[] = [TIGHT, TIGHT, TIGHT, TIGHT, TIGHT, TIGHT];

// Mercado: decide a 100 e abre a 105 (gap de alta); o stop sai sem gap no candle seguinte.
export const GAP_UP_PRICES: readonly CandleSpec[] = [
  QUIET,
  QUIET,
  QUIET,
  ['105', '106', '104.5', '105.5'],
  ['105', '106', '100', '101'],
  QUIET,
];

function sellAndCommandsScenario(): EngineScenario {
  return scenario({
    name: 'sell-paths-commands-and-sentiment',
    strategy: buildReferenceStrategy({ ...LIMIT_ENTRY, expiryCandles: 3 }),
    candles: buildCandles(SELL_AND_COMMANDS_PRICES),
    sentiment: [observation(2, 30, 49), observation(10, 85), observation(12, 20)],
    commands: commandsByIndex([
      [9, [command(9, 'halt', 'user_stop')]],
      [11, [command(11, 'resume', 'user_resume')]],
      [14, [command(14, 'exit_position', 'goal_reached')]],
    ]),
    requiredEvents: [
      ENGINE_EVENT_KIND.SELL_CANCELS_LIMIT,
      ENGINE_EVENT_KIND.SELL_EXITS_AT_MARKET,
      ENGINE_EVENT_KIND.HALT_BLOCKS_ENTRY,
      ENGINE_EVENT_KIND.RESUME_AFTER_HALT,
      ENGINE_EVENT_KIND.COMMAND_EXIT,
      ENGINE_EVENT_KIND.SENTIMENT_USED,
      ENGINE_EVENT_KIND.SENTIMENT_STALE,
    ],
  });
}

// Lacuna confirmada com posição aberta: sai na abertura seguinte à lacuna e o BUY desse candle não entra.
export const GAP_OPEN_POSITION_PRICES: readonly CandleSpec[] = [
  QUIET,
  QUIET,
  QUIET,
  QUIET,
  QUIET,
  QUIET,
  QUIET,
  QUIET,
  QUIET,
];

// Lacuna confirmada com a limitada viva: ela caduca com motivo `gap`; depois a entrada nova preenche.
export const GAP_LIVE_LIMIT_PRICES: readonly CandleSpec[] = [
  QUIET,
  QUIET,
  QUIET,
  ['100', '101', '99.5', '100'],
  QUIET,
  QUIET,
  ['100', '101', '98.5', '99.5'],
  QUIET,
];

function gapScenarios(): EngineScenario[] {
  return [
    scenario({
      name: 'gap-closes-the-open-position',
      strategy: buildReferenceStrategy(MARKET_ENTRY),
      candles: buildCandlesWithGaps(GAP_OPEN_POSITION_PRICES, { 5: 1 }),
      requiredEvents: [ENGINE_EVENT_KIND.MARKET_ENTRY_FILL, ENGINE_EVENT_KIND.GAP_CLOSES_POSITION],
    }),
    scenario({
      name: 'gap-cancels-the-live-limit-entry',
      strategy: buildReferenceStrategy({ ...LIMIT_ENTRY, expiryCandles: 3 }),
      candles: buildCandlesWithGaps(GAP_LIVE_LIMIT_PRICES, { 4: 2 }),
      requiredEvents: [
        ENGINE_EVENT_KIND.GAP_CANCELS_PENDING_ORDER,
        ENGINE_EVENT_KIND.LIMIT_ENTRY_FILL_INTRA_CANDLE,
      ],
    }),
  ];
}

export function buildReferenceScenarios(): EngineScenario[] {
  return [
    scenario({
      name: 'market-entries-with-stop-gap-and-target',
      strategy: buildReferenceStrategy(MARKET_ENTRY),
      candles: buildCandles(MARKET_SCENARIO_PRICES),
      requiredEvents: [
        ENGINE_EVENT_KIND.MARKET_ENTRY_FILL,
        ENGINE_EVENT_KIND.STOP_EXIT_WITH_TARGET_TOUCHED,
        ENGINE_EVENT_KIND.STOP_EXIT_WITHOUT_GAP,
        ENGINE_EVENT_KIND.STOP_EXIT_ON_GAP,
        ENGINE_EVENT_KIND.TARGET_EXIT,
        ENGINE_EVENT_KIND.BUY_SIGNAL_WHILE_POSITION_OPEN,
      ],
    }),
    scenario({
      name: 'limit-entries-with-expiry-and-gap',
      strategy: buildReferenceStrategy(LIMIT_ENTRY),
      candles: buildCandles(LIMIT_SCENARIO_PRICES),
      requiredEvents: [
        ENGINE_EVENT_KIND.LIMIT_EXPIRED,
        ENGINE_EVENT_KIND.LIMIT_ENTRY_FILL_INTRA_CANDLE,
        ENGINE_EVENT_KIND.LIMIT_ENTRY_FILL_AT_OPEN,
        ENGINE_EVENT_KIND.TARGET_EXIT,
      ],
    }),
    sellAndCommandsScenario(),
    scenario({
      name: 'rejections-and-volume-cap',
      strategy: buildReferenceStrategy(MARKET_ENTRY),
      candles: buildCandles(REJECTIONS_PRICES),
      requiredEvents: [
        ENGINE_EVENT_KIND.REJECTED_ZERO_ATR,
        ENGINE_EVENT_KIND.REJECTED_INVALID_STOP,
        ENGINE_EVENT_KIND.REJECTED_BELOW_MIN_NOTIONAL,
        ENGINE_EVENT_KIND.VOLUME_CAPPED_FILL,
      ],
    }),
    scenario({
      name: 'edge-fills-touch-gap-and-intra-candle',
      strategy: buildReferenceStrategy(LIMIT_ENTRY),
      candles: buildCandles(EDGE_FILLS_PRICES),
      requiredEvents: [
        ENGINE_EVENT_KIND.LIMIT_TOUCHED_WITHOUT_FILL,
        ENGINE_EVENT_KIND.LIMIT_ENTRY_FILL_AT_LIMIT_ON_LATER_OPEN,
        ENGINE_EVENT_KIND.TARGET_TOUCHED_WITHOUT_EXIT,
        ENGINE_EVENT_KIND.TARGET_EXIT_ON_GAP,
        ENGINE_EVENT_KIND.TARGET_PASSED_ON_INTRA_CANDLE_ENTRY,
      ],
    }),
    scenario({
      name: 'cash-bound-entry',
      strategy: buildReferenceStrategy(MARKET_ENTRY, { riskPerTrade: '0.1', stopAtrMultiple: '1' }),
      candles: buildCandles(CASH_BOUND_PRICES),
      requiredEvents: [ENGINE_EVENT_KIND.CASH_BOUND_ENTRY],
    }),
    scenario({
      name: 'gap-up-entry-then-stop',
      strategy: buildReferenceStrategy(MARKET_ENTRY),
      candles: buildCandles(GAP_UP_PRICES),
      requiredEvents: [ENGINE_EVENT_KIND.GAP_UP_ENTRY, ENGINE_EVENT_KIND.STOP_EXIT_WITHOUT_GAP],
    }),
    ...gapScenarios(),
  ];
}
