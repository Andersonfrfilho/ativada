// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  AnalystInput,
  AnalystPosition,
  AnalystWallet,
} from '../../../packages/risk-analyst/src/index.js';
import type {
  EngineCandle,
  EngineMarket,
  GoalSpec,
  SentimentObservation,
  StoredSentimentObservation,
} from '../../../packages/strategy-engine/src/index.js';
import { CLASSIC_STRATEGY } from '../strategy-engine/signal/classic-signals.fixture.js';
import { CANDLE, closedPosition, openPosition } from './decision-scenario.fixture.js';
import slice from './market/btcusdt-15m-3300.json' with { type: 'json' };
import fearGreedRows from './market/btcusdt-15m-3300.fear-greed.json' with { type: 'json' };
import type { RiskAnalystApi } from './risk-analyst-api.fixture.js';
import { syntheticSentiment } from './specialist-dataset.fixture.js';
import { buildSyntheticCandles, SYNTHETIC_SYMBOL } from './synthetic-market.fixture.js';

// Os casos do dourado `analyst-1` (T1.4 da spec 007): o recorte REAL de 15 min (BTCUSDT, 3.300 velas e o Fear & Greed do
// banco) e um mercado SINTÉTICO de 3.000 velas em que a Reversão tem o que provar, cada um decidido em vários instantes e
// com carteiras diferentes. O mesmo código monta os casos para o teste e para o gravador do dourado.

export const GOLDEN_RISK_PER_TRADE = '0.01';
const INITIAL_BALANCE = '10000';
const GOAL: GoalSpec = { targetRate: '0.03', maxLossRate: '0.05', horizonDays: 7 };
const SYNTHETIC_LENGTH = 3000;
const SYNTHETIC_SEED = 4242;
const SYNTHETIC_FIRST_OPEN = 20_000 * CANDLE;

export type WalletVariant = 'clean' | 'losing' | 'busy' | 'exit' | 'streak' | 'room';

type RunCost = { readonly feeRate: string; readonly slippageRate: string };

// O custo padrão (taxa 0,1% + slippage 0,05% por lado) e um custo baixo, em que o movimento de 15 min do BTC paga a ida e volta.
const STANDARD_COST: RunCost = { feeRate: '0.001', slippageRate: '0.0005' };
const CHEAP_COST: RunCost = { feeRate: '0.0002', slippageRate: '0.0001' };

type CaseSpec = {
  readonly id: string;
  readonly source: 'real' | 'synthetic';
  readonly index: number;
  readonly variant: WalletVariant;
  readonly runCost?: RunCost;
};

// Os instantes do mercado sintético foram escolhidos pela varredura de todas as velas de 1.200 a 2.999: 2711 e 2015 são
// LIBERADA com a porta aberta (1 h e 15 min), 2190 é MODERADA por oscilação alta, 1607 é MODERADA por volume baixo, 1314 é
// equipe contra (pausa) e 2531 é CAUTELA por oscilação acima do percentil 95.
export const GOLDEN_CASE_SPECS: readonly CaseSpec[] = [
  { id: 'real:3299:clean', source: 'real', index: 3299, variant: 'clean' },
  { id: 'real:3299:losing', source: 'real', index: 3299, variant: 'losing' },
  { id: 'real:3000:cheap', source: 'real', index: 3000, variant: 'clean', runCost: CHEAP_COST },
  { id: 'real:2600:exit', source: 'real', index: 2600, variant: 'exit' },
  { id: 'real:2000:room', source: 'real', index: 2000, variant: 'room' },
  { id: 'real:1500:streak', source: 'real', index: 1500, variant: 'streak' },
  { id: 'synthetic:2711:clean', source: 'synthetic', index: 2711, variant: 'clean' },
  { id: 'synthetic:2015:clean', source: 'synthetic', index: 2015, variant: 'clean' },
  { id: 'synthetic:2190:clean', source: 'synthetic', index: 2190, variant: 'clean' },
  { id: 'synthetic:1607:clean', source: 'synthetic', index: 1607, variant: 'clean' },
  { id: 'synthetic:1314:exit', source: 'synthetic', index: 1314, variant: 'exit' },
  { id: 'synthetic:2531:busy', source: 'synthetic', index: 2531, variant: 'busy' },
];

function loss(closedAt: number): AnalystPosition {
  return closedPosition({
    openedCandleTime: closedAt - 2 * CANDLE,
    closedCandleTime: closedAt,
    netProfit: '-12.5',
  });
}

function buildBusyPositions(candleTime: number): AnalystPosition[] {
  return Array.from({ length: 8 }, (_unused, index) => {
    const openedCandleTime = candleTime - (index + 1) * 4 * CANDLE;
    return closedPosition({
      openedCandleTime,
      closedCandleTime: openedCandleTime + 2 * CANDLE,
      netProfit: index % 2 === 0 ? '30' : '-10',
    });
  });
}

function buildWallet(variant: WalletVariant, candleTime: number): AnalystWallet {
  const clean: AnalystWallet = {
    initialBalance: INITIAL_BALANCE,
    equity: INITIAL_BALANCE,
    equityReference: null,
    isHalted: false,
    lastHaltReason: null,
    positions: [],
  };
  switch (variant) {
    case 'clean':
      return clean;
    case 'losing':
      return { ...clean, equity: '9890' };
    case 'busy':
      return { ...clean, positions: buildBusyPositions(candleTime) };
    case 'exit':
      return {
        ...clean,
        isHalted: true,
        lastHaltReason: 'analyst_pause',
        positions: [openPosition(candleTime - 3 * CANDLE)],
      };
    case 'streak':
      return {
        ...clean,
        positions: [
          loss(candleTime - CANDLE),
          loss(candleTime - 6 * CANDLE),
          loss(candleTime - 10 * CANDLE),
        ],
      };
    case 'room':
      return { ...clean, equity: '9650', equityReference: '9650' };
  }
}

type SliceRow = readonly [number, string, string, string, string, string, number];

const REAL_MARKET: EngineMarket = {
  symbol: 'BTCUSDT',
  timeframe: '15m',
  sentimentSource: 'alternative.me',
};
const SYNTHETIC_MARKET: EngineMarket = {
  symbol: SYNTHETIC_SYMBOL,
  timeframe: '15m',
  sentimentSource: 'alternative.me',
};

function loadRealCandles(): readonly EngineCandle[] {
  return (slice as unknown as SliceRow[]).map(
    ([openTime, open, high, low, close, volume, closeTime]) => ({
      symbol: REAL_MARKET.symbol,
      timeframe: REAL_MARKET.timeframe,
      openTime,
      closeTime,
      open,
      high,
      low,
      close,
      volume,
    }),
  );
}

type Dataset = {
  readonly market: EngineMarket;
  readonly candles: readonly EngineCandle[];
  readonly sentiments: readonly (SentimentObservation | undefined)[];
};

function buildDatasets(api: RiskAnalystApi): Readonly<Record<CaseSpec['source'], Dataset>> {
  const realCandles = loadRealCandles();
  const observations: StoredSentimentObservation[] = (fearGreedRows as [number, number][]).map(
    ([observedAt, value]) => ({
      value,
      observedAt,
      source: REAL_MARKET.sentimentSource,
      createdAt: observedAt,
    }),
  );
  const syntheticCandles = buildSyntheticCandles({
    length: SYNTHETIC_LENGTH,
    seed: SYNTHETIC_SEED,
    firstOpenTime: SYNTHETIC_FIRST_OPEN,
  });
  return {
    real: {
      market: REAL_MARKET,
      candles: realCandles,
      sentiments: api.selectSentiments({
        candles: realCandles,
        observations,
        source: REAL_MARKET.sentimentSource,
      }),
    },
    synthetic: {
      market: SYNTHETIC_MARKET,
      candles: syntheticCandles,
      sentiments: syntheticCandles.map((candle) =>
        syntheticSentiment(candle.closeTime, SYNTHETIC_MARKET.sentimentSource),
      ),
    },
  };
}

export type GoldenCase = { readonly id: string; readonly input: AnalystInput };

// O que o dourado guarda de um caso: a decisão inteira e as frases dela, em JSON compacto e estável.
export function recordGoldenCase(api: RiskAnalystApi, input: AnalystInput): string {
  const decision = api.decideAnalyst(input);
  const messages = api.buildAnalystMessages({
    decision,
    riskPerTrade: GOLDEN_RISK_PER_TRADE,
    isShadow: true,
  });
  return JSON.stringify({ decision, messages });
}

// O sinal só depende do passado (provado nos contratos de corte): roda uma vez por conjunto e cada caso recorta em `t`.
export function buildGoldenCases(api: RiskAnalystApi): readonly GoldenCase[] {
  const datasets = buildDatasets(api);
  const computed = {
    real: buildSeries(api, datasets.real),
    synthetic: buildSeries(api, datasets.synthetic),
  };
  return GOLDEN_CASE_SPECS.map((spec) => {
    const { candles } = datasets[spec.source];
    const cut = spec.index + 1;
    const series = computed[spec.source];
    const candleTime = candles[spec.index]?.openTime ?? 0;
    return {
      id: spec.id,
      input: {
        candleTime,
        candles: candles.slice(0, cut),
        team: {
          trend: series.team.trend.slice(0, cut),
          reversion: series.team.reversion.slice(0, cut),
          volume: series.team.volume.slice(0, cut),
          sentiment: series.team.sentiment.slice(0, cut),
        },
        strategyVotes: series.strategyVotes.slice(0, cut),
        runCost: spec.runCost ?? STANDARD_COST,
        riskPerTrade: GOLDEN_RISK_PER_TRADE,
        wallet: buildWallet(spec.variant, candleTime),
        goal: spec.variant === 'room' ? GOAL : null,
        isWaitingForData: false,
        isCatchingUp: false,
      },
    };
  });
}

function buildSeries(
  api: RiskAnalystApi,
  dataset: Dataset,
): {
  readonly team: AnalystInput['team'];
  readonly strategyVotes: AnalystInput['strategyVotes'];
} {
  const { market, candles, sentiments } = dataset;
  return {
    team: api.runSpecialistTeam({ market, candles, sentiments }),
    strategyVotes: api.computeVoteSeries({
      strategy: CLASSIC_STRATEGY,
      market,
      candles,
      sentiments,
    }),
  };
}
