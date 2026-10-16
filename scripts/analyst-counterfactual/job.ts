// Copyright (c) 2026 Ada Technology. All rights reserved.
import { resolveSymbolFilters } from '../../packages/market-data-crypto/src/index.js';
import { SPECIALIST_CATALOG } from '../../packages/risk-analyst/src/index.js';
import {
  CLASSIC_SCOREBOARD_STRATEGY,
  computeStrategyLeadInCandles,
  createRunSetup,
  createStrategyVersion,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  RUN_PARAMETERS_SCHEMA_VERSION,
  type RunSetup,
  type StrategyVersion,
} from '../../packages/strategy-engine/src/index.js';
import type {
  JobResult,
  PairData,
  SimulationOutcome,
  SimulationSummary,
  StrategyKey,
} from './counterfactual.types.js';
import { simulate } from './simulation.js';
import { computeWindows } from './window-verdict.js';

export const COUNTERFACTUAL_TIMEFRAME = '15m';
export const COUNTERFACTUAL_DAYS = 183;
const CANDLES_PER_DAY = 96;
const INITIAL_BALANCE = '10000';
const SENTIMENT_SOURCE = 'alternative.me';

type StrategyEntry = { readonly label: string; readonly version: StrategyVersion };

// "Placar clássico" é a estratégia de exemplo do produto. "Reversão" é a estratégia de uma família só que o especialista
// Reversão do analista usa (RSI 14 em 30/70 + Bollinger 20/2, entra com +1 e sai com −1, o mesmo risco de ATR do Placar).
export const COUNTERFACTUAL_STRATEGIES: Readonly<Record<StrategyKey, StrategyEntry>> = {
  classic: { label: 'Placar clássico', version: CLASSIC_SCOREBOARD_STRATEGY.version },
  reversion: {
    label: 'Reversão',
    version: createStrategyVersion(SPECIALIST_CATALOG.reversion.config),
  },
};

export function buildSetup(symbol: string): RunSetup {
  return createRunSetup({
    schemaVersion: RUN_PARAMETERS_SCHEMA_VERSION,
    symbol,
    timeframe: COUNTERFACTUAL_TIMEFRAME,
    sentimentSource: SENTIMENT_SOURCE,
    initialBalance: INITIAL_BALANCE,
    ...resolveSymbolFilters(symbol),
  });
}

function summaryOf(outcome: SimulationOutcome): SimulationSummary {
  return {
    entries: outcome.entries,
    closedPositions: outcome.closedPositions,
    feesPaid: outcome.feesPaid,
    finalEquity: outcome.finalEquity,
    maxDrawdownAtLow: outcome.maxDrawdownAtLow,
  };
}

export type RunJobParams = {
  readonly pair: PairData;
  readonly strategy: StrategyKey;
  // Quantas velas do fim da série formam o período medido (padrão: 183 dias de 15 min).
  readonly periodCandles?: number;
};

// UM par e UMA estratégia: a estratégia sozinha e a mesma com o analista, sobre as mesmas velas, em memória.
export async function runJob(params: RunJobParams): Promise<JobResult> {
  const { pair } = params;
  const entry = COUNTERFACTUAL_STRATEGIES[params.strategy];
  const setup = buildSetup(pair.market.symbol);
  const periodCandles = params.periodCandles ?? COUNTERFACTUAL_DAYS * CANDLES_PER_DAY;
  const periodStartIndex = pair.candles.length - periodCandles;
  const leadIn = computeStrategyLeadInCandles(entry.version.config);
  // O motor emite o primeiro ponto de patrimônio na vela que completa o aquecimento (a de número `leadIn`).
  const firstIndex = periodStartIndex - leadIn + 1;
  const periodStart = pair.candles[periodStartIndex];
  const last = pair.candles.at(-1);
  if (firstIndex < 0 || periodStart === undefined || last === undefined) {
    throw new Error('a série do banco é curta demais para o período');
  }
  const common = { strategy: entry.version, setup, pair, firstIndex };
  const baseline = await simulate({ ...common, withAnalyst: false });
  const withAnalyst = await simulate({ ...common, withAnalyst: true });
  const gateOnly = await simulate({ ...common, withAnalyst: true, sizeMode: 'gate_only' });
  if (
    baseline.outcome.equity[0]?.candleTime !== periodStart.openTime ||
    withAnalyst.outcome.equity[0]?.candleTime !== periodStart.openTime
  ) {
    throw new Error('o período não começa na vela esperada');
  }
  return {
    symbol: pair.market.symbol,
    strategy: params.strategy,
    strategyLabel: entry.label,
    initialBalance: INITIAL_BALANCE,
    periodStart: periodStart.openTime,
    periodEnd: last.openTime,
    candles: periodCandles,
    baseline: summaryOf(baseline.outcome),
    withAnalyst: summaryOf(withAnalyst.outcome),
    gateOnly: summaryOf(gateOnly.outcome),
    tally: withAnalyst.tally,
    windows: computeWindows({
      baseline: baseline.outcome.equity,
      analyst: withAnalyst.outcome.equity,
      initialBalance: INITIAL_BALANCE,
      periodStart: periodStart.openTime,
      periodEnd: last.openTime,
      candleMilliseconds: ENGINE_TIMEFRAME_DURATION_MILLISECONDS[COUNTERFACTUAL_TIMEFRAME],
    }),
  };
}
