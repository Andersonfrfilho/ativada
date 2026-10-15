// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  CandleRecord,
  JsonContainer,
  SignalInput,
  WalkForwardWindowInput,
} from '../../../packages/database/src/index.js';
import type { RunsHarness } from '../api-routes/runs-harness.fixture.js';
import { buildHourlyCandles, EXCHANGE, HOUR } from '../api-routes/runs-harness.fixture.js';
import { at, SYMBOL } from '../live-status/live-status-scenario.fixture.js';
import classicStrategy from '../strategy-engine/classic-scoreboard.strategy.json';

// Regras de preço (canal Donchian, cruzamento de EMA e Bollinger) e uma que não desenha linha (MACD), nesta ordem.
const DONCHIAN_RULE = { id: 'donchian-20', kind: 'donchian_breakout', period: 20 } as const;
const EMA_RULE = { id: 'ema-9-21', kind: 'ema_cross', fastPeriod: 9, slowPeriod: 21 } as const;
const BOLLINGER_RULE = {
  id: 'bollinger-20',
  kind: 'bollinger',
  period: 20,
  deviations: '2.5',
} as const;
const MACD_RULE = {
  id: 'macd-12-26-9',
  kind: 'macd',
  fastPeriod: 12,
  slowPeriod: 26,
  signalPeriod: 9,
} as const;
const RSI_RULE = { id: 'rsi-14', kind: 'rsi', period: 14, oversold: 30, overbought: 70 } as const;

export const PRICE_RULES_CONFIG = {
  ...classicStrategy,
  rules: [DONCHIAN_RULE, EMA_RULE, BOLLINGER_RULE, MACD_RULE],
};
export const NO_PRICE_RULE_CONFIG = { ...classicStrategy, rules: [MACD_RULE, RSI_RULE] };

// Cria a estratégia do dono com a configuração dada e devolve a versão (a execução se prende a ela).
export async function seedConfiguredStrategy(
  harness: RunsHarness,
  params: { readonly subject: string; readonly config: JsonContainer; readonly nonce: string },
): Promise<string> {
  const created = await harness.strategies.repository.createStrategyWithFirstVersion(
    harness.scopeOf(params.subject),
    {
      name: `Estratégia ${params.nonce}`,
      isExample: false,
      config: structuredClone(params.config),
      configHash: `hash-${params.subject}-${params.nonce}`.padEnd(64, '0'),
    },
  );
  return created.version.id;
}

export type LayerSignalOptions = {
  readonly score?: string;
  readonly indicators?: Readonly<Record<string, number | null>>;
};

// Uma decisão com todas as saídas de preço das três regras gravadas (valores previsíveis por índice).
export function layerSignal(
  candleTime: number,
  index: number,
  options: LayerSignalOptions = {},
): SignalInput {
  const score = options.score ?? String((index % 5) - 2);
  const numericScore = Number(score);
  const signal: SignalInput = {
    candleTime,
    action: numericScore >= 2 ? 'BUY' : numericScore <= -2 ? 'SELL' : 'HOLD',
    score,
    regime: 'ranging',
    votes: [],
    indicators: {
      'rule:donchian-20.upper': 31000 + index,
      'rule:donchian-20.lower': 29000 + index,
      'rule:ema-9-21.fast': 30000.5 + index,
      'rule:ema-9-21.slow': 30000 + index,
      'rule:bollinger-20.upper': 31000.25,
      'rule:bollinger-20.middle': 30000.125,
      'rule:bollinger-20.lower': 29000.0625,
      'rule:macd-12-26-9.macd': 1.5,
      'risk:atr': index % 7 === 0 ? null : 120.5,
      ...options.indicators,
    },
    sentimentObservation: undefined,
    reason: `Sinal ${index}`,
  };
  return signal;
}

export function windowRow(params: {
  readonly index: number;
  readonly testStart: number;
  readonly testEnd: number;
  readonly assignment:
    readonly { readonly path: string; readonly value: number | string }[] | undefined;
}): WalkForwardWindowInput {
  return {
    windowIndex: params.index,
    trainStart: params.testStart - 10 * HOUR,
    trainEnd: params.testStart,
    testStart: params.testStart,
    testEnd: params.testEnd,
    bestParams:
      params.assignment === undefined
        ? undefined
        : { combinationIndex: params.index, assignment: params.assignment },
    status: params.assignment === undefined ? 'no_eligible_parameters' : 'ok',
    inSample: {},
    outOfSample: {},
    eligibleCombinations: params.assignment === undefined ? 0 : 3,
  };
}

// Velas horárias do par com o fechamento escolhido por índice (a primeira abre em `at(0)`).
export function buildCloseSeries(params: {
  readonly count: number;
  readonly closeAt: (index: number) => string;
}): readonly CandleRecord[] {
  return buildHourlyCandles({ symbol: SYMBOL, count: params.count, firstOpenTime: at(0) }).map(
    (candle, index) => ({
      ...candle,
      exchange: EXCHANGE,
      open: params.closeAt(index),
      high: `${Number(params.closeAt(index)) + 10}.00000000`,
      low: `${Number(params.closeAt(index)) - 10}.00000000`,
      close: params.closeAt(index),
    }),
  );
}
