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

// O analista de uma simulação nesta ronda: em sombra só observa (spec 007, RNF01); no governar entrega o teto de entrada e
// a saída por tempo ao passo (A21).
export type AnalystRunKit = {
  readonly runId: string;
  readonly mode: AnalystMode;
  // Governar com versão ou vela desconhecida não roda a regra: o passo recebe a escala 0 (falha segura).
  readonly isSupported: boolean;
  readonly market: EngineMarket;
  readonly seriesCache: AnalystSeriesCache;
  readonly source: SeriesSource;
  readonly history: AnalystRunHistory;
  readonly goal: GoalSpec | null;
  readonly waiting: { readonly isPending: boolean };
  // Quem fechou a porta da carteira agora (`analyst_pause` só se foi o analista): ele nunca a fecha (sombra ou governar), então é nulo.
  readonly haltReason: () => string | null;
};

function readProperty(value: unknown, name: string): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return Object.getOwnPropertyDescriptor(value, name)?.value;
}

// `runs.request.analyst` gravado pela API: versão conhecida e vela de 15 min (`isKnownAnalystRequest`) e modo sombra. Qualquer outra coisa (o governar é
// de `isGovernAnalystRequested`) deixa a simulação sem analista em sombra, como se ele nunca tivesse sido pedido.
function isKnownAnalystRequest(run: RunRecord): boolean {
  const analyst = readProperty(run.request, 'analyst');
  return (
    readProperty(analyst, 'version') === ANALYST_VERSION &&
    run.timeframe === ANALYST_RULES.baseTimeframe
  );
}

export function isShadowAnalystRequested(run: RunRecord): boolean {
  return (
    readProperty(readProperty(run.request, 'analyst'), 'mode') === ANALYST_RECORD_MODE.SHADOW &&
    isKnownAnalystRequest(run)
  );
}

export type AnalystMode = (typeof ANALYST_RECORD_MODE)[keyof typeof ANALYST_RECORD_MODE];

// Governar é pedido pelo modo gravado, mesmo com versão ou vela desconhecida: pedido que não se entende não roda SEM governo.
export function isGovernAnalystRequested(run: RunRecord): boolean {
  return readProperty(readProperty(run.request, 'analyst'), 'mode') === ANALYST_RECORD_MODE.GOVERN;
}

function resolveAnalystMode(run: RunRecord): AnalystMode | undefined {
  if (isShadowAnalystRequested(run)) return ANALYST_RECORD_MODE.SHADOW;
  return isGovernAnalystRequested(run) ? ANALYST_RECORD_MODE.GOVERN : undefined;
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
  const mode = resolveAnalystMode(context.run);
  if (mode === undefined) return undefined;
  const { symbol, timeframe, sentimentSource } = context.setup.parameters;
  return {
    runId: context.run.id,
    mode,
    isSupported: mode === ANALYST_RECORD_MODE.SHADOW || isKnownAnalystRequest(context.run),
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
