// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RunRecord } from '@ativada/database';
import {
  ANALYST_RULES,
  ANALYST_VERSION,
  CANDLE_MILLISECONDS,
  type AnalystInput,
  type AnalystWallet,
} from '@ativada/risk-analyst';
import type {
  EngineCandle,
  EngineMarket,
  GoalSpec,
  StepResult,
  StoredSentimentObservation,
} from '@ativada/strategy-engine';

import { ANALYST_RECORD_MODE } from './analyst-live.constant.js';
import type { AnalystRunHistory } from './analyst-run-history.js';
import { createAnalystRunHistory } from './analyst-run-history.js';
import type { AnalystSeriesCache, SeriesSource } from './analyst-series-cache.js';
import type { LiveRunSession } from './live-run.types.js';
import type { LiveContext } from './load-live-context.js';

// O analista em SOMBRA de uma simulação, nesta ronda: só observa, nunca muda o passo (spec 007, RNF01).
export type AnalystRunKit = {
  readonly runId: string;
  readonly market: EngineMarket;
  readonly seriesCache: AnalystSeriesCache;
  readonly source: SeriesSource;
  readonly history: AnalystRunHistory;
  readonly goal: GoalSpec | null;
  readonly waiting: { readonly isPending: boolean };
  // Quem fechou a porta da carteira agora (`analyst_pause` só se foi o analista): em sombra ele nunca a fecha, então é nulo.
  readonly haltReason: () => string | null;
};

function readProperty(value: unknown, name: string): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return Object.getOwnPropertyDescriptor(value, name)?.value;
}

// `runs.request.analyst` gravado pela API: versão conhecida e modo sombra. Qualquer outra coisa (governar só chega na Fase 4,
// outra versão, vela que não é a de 15 min) deixa a simulação sem analista, como se ele nunca tivesse sido pedido.
export function isShadowAnalystRequested(run: RunRecord): boolean {
  const analyst = readProperty(run.request, 'analyst');
  return (
    readProperty(analyst, 'version') === ANALYST_VERSION &&
    readProperty(analyst, 'mode') === ANALYST_RECORD_MODE.SHADOW &&
    run.timeframe === ANALYST_RULES.baseTimeframe
  );
}

export type CreateAnalystKitParams = {
  readonly context: LiveContext;
  readonly session: LiveRunSession;
  readonly seriesCache: AnalystSeriesCache;
  readonly observations: readonly StoredSentimentObservation[];
  // A última vela fechada que a ronda tem: a série do par estende até ela numa leitura só.
  readonly lastOpenTime: number;
  readonly goal: GoalSpec | null;
  readonly waiting: { readonly isPending: boolean };
};

export function createAnalystKit(params: CreateAnalystKitParams): AnalystRunKit | undefined {
  const { context, session } = params;
  if (!isShadowAnalystRequested(context.run)) return undefined;
  const { symbol, timeframe, sentimentSource } = context.setup.parameters;
  return {
    runId: context.run.id,
    market: { symbol, timeframe, sentimentSource },
    seriesCache: params.seriesCache,
    source: {
      findCandles: session.findCandles,
      observations: params.observations,
      lastOpenTime: params.lastOpenTime,
    },
    history: createAnalystRunHistory(session),
    goal: params.goal,
    waiting: params.waiting,
    haltReason: () => null,
  };
}

export type AnalystStepContext = {
  readonly context: Pick<LiveContext, 'setup' | 'strategy'>;
  readonly candle: EngineCandle;
  readonly result: StepResult;
};

function buildWallet(kit: AnalystRunKit, step: AnalystStepContext): AnalystWallet {
  const { candle, result, context } = step;
  const referenceTime = candle.openTime - ANALYST_RULES.lossWindowCandles * CANDLE_MILLISECONDS;
  return {
    initialBalance: context.setup.parameters.initialBalance,
    equity: kit.history.equityAt(candle.openTime) ?? result.state.wallet.cash,
    equityReference: kit.history.equityAt(referenceTime) ?? null,
    isHalted: result.state.wallet.isHalted,
    lastHaltReason: kit.haltReason(),
    positions: kit.history.positions(),
  };
}

// A entrada da regra pura para a vela `t`: a série do par (uma leitura por par por ronda), o que a simulação gravou e a
// carteira DEPOIS do passo de `t`. O relógio fica aqui: a vela está atrasada se a ronda tem uma vela fechada mais nova.
export async function loadAnalystInput(
  kit: AnalystRunKit,
  step: AnalystStepContext,
): Promise<AnalystInput> {
  const { candle, context } = step;
  await kit.history.seed(candle.openTime);
  const series = await kit.seriesCache.read({
    market: kit.market,
    candleTime: candle.openTime,
    source: kit.source,
  });
  const { feeRate, slippageRate } = context.setup.parameters;
  return {
    candleTime: candle.openTime,
    candles: series.candles,
    team: series.team,
    strategyVotes: kit.history.strategyVotes(series.candles),
    runCost: { feeRate, slippageRate },
    riskPerTrade: context.strategy.config.risk.riskPerTrade,
    wallet: buildWallet(kit, step),
    goal: kit.goal,
    isWaitingForData: kit.waiting.isPending,
    isCatchingUp: candle.openTime < kit.source.lastOpenTime,
  };
}
