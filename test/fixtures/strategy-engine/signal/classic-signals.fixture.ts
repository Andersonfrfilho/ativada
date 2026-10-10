// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createHash } from 'node:crypto';

import {
  createStrategyVersion,
  SIGNAL_ACTION,
  ENGINE_TIMEFRAME,
  type EngineCandle,
  type EngineMarket,
  type EngineTimeframe,
  type SignalDecision,
  type StrategyVersion,
} from '../../../../packages/strategy-engine/src/index.js';
import { loadClassicScoreboard } from '../engine-scenarios.fixture.js';
import btcusdtHourly from '../market/btcusdt-1h-500.json' with { type: 'json' };
import ethusdtDaily from '../market/ethusdt-1d-400.json' with { type: 'json' };
import { SENTIMENT_SOURCE } from './scoreboard-configs.fixture.js';
import type { SignalApi } from './signal-api.fixture.js';

// Linha crua da Binance: [openTime, open, high, low, close, volume, closeTime, …], tudo em texto exato.
type BinanceKline = readonly (string | number)[];

export type RealDataset = {
  readonly name: string;
  readonly market: EngineMarket;
  readonly candles: readonly EngineCandle[];
};

function toEngineCandle(params: {
  readonly row: BinanceKline;
  readonly symbol: string;
  readonly timeframe: EngineTimeframe;
}): EngineCandle {
  const [openTime, open, high, low, close, volume, closeTime] = params.row;
  return {
    symbol: params.symbol,
    timeframe: params.timeframe,
    openTime: Number(openTime),
    closeTime: Number(closeTime),
    open: String(open),
    high: String(high),
    low: String(low),
    close: String(close),
    volume: String(volume),
  };
}

function buildDataset(params: {
  readonly name: string;
  readonly symbol: string;
  readonly timeframe: EngineTimeframe;
  readonly rows: readonly BinanceKline[];
}): RealDataset {
  const { symbol, timeframe } = params;
  return {
    name: params.name,
    market: { symbol, timeframe, sentimentSource: SENTIMENT_SOURCE },
    candles: params.rows.map((row) => toEngineCandle({ row, symbol, timeframe })),
  };
}

export const REAL_DATASETS: readonly RealDataset[] = [
  buildDataset({
    name: 'BTCUSDT 1h × 500',
    symbol: 'BTCUSDT',
    timeframe: ENGINE_TIMEFRAME.ONE_HOUR,
    rows: btcusdtHourly,
  }),
  buildDataset({
    name: 'ETHUSDT 1d × 400',
    symbol: 'ETHUSDT',
    timeframe: ENGINE_TIMEFRAME.ONE_DAY,
    rows: ethusdtDaily,
  }),
];

export const CLASSIC_STRATEGY: StrategyVersion = createStrategyVersion(loadClassicScoreboard());

// Um `signalStep` por candle fechado, do estado inicial: o laço do backtest, sem carteira.
export function runClassicSignals(
  api: SignalApi,
  dataset: RealDataset,
): readonly (SignalDecision | null)[] {
  let state = api.createStrategySignalState(CLASSIC_STRATEGY.config);
  const signals: (SignalDecision | null)[] = [];
  for (const candle of dataset.candles) {
    const result = api.signalStep({
      strategy: CLASSIC_STRATEGY,
      market: dataset.market,
      state,
      candle,
    });
    signals.push(result.signal);
    state = result.state;
  }
  return signals;
}

export type SignalSummary = {
  readonly candles: number;
  readonly decided: number;
  readonly buy: number;
  readonly sell: number;
  readonly hold: number;
  readonly digest: string;
};

// Contagem por ação e impressão digital de TODOS os sinais (motivo incluso): o que o dourado prende.
export function summarizeSignals(signals: readonly (SignalDecision | null)[]): SignalSummary {
  const decided = signals.filter((signal): signal is SignalDecision => signal !== null);
  const count = (action: string): number =>
    decided.filter((signal) => signal.action === action).length;
  return {
    candles: signals.length,
    decided: decided.length,
    buy: count(SIGNAL_ACTION.BUY),
    sell: count(SIGNAL_ACTION.SELL),
    hold: count(SIGNAL_ACTION.HOLD),
    digest: createHash('sha256').update(JSON.stringify(decided)).digest('hex'),
  };
}
