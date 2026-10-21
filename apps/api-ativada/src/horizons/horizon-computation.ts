// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  assertGoalSeries,
  computeGoalSignals,
  computeHorizonWindows,
  EngineInputError,
  GoalInputError,
  HORIZON_DAYS,
  horizonCandlesOf,
  summarizeHorizon,
  toEngineDecimal,
  type EngineCandle,
  type HorizonSummary,
  type IntradaySummary,
  type RunSetup,
  type SentimentObservation,
  type StrategyVersion,
} from '@ativada/strategy-engine';

import { runIntradayInMemory } from './horizon-intraday-run.js';

export const HORIZON_COMPUTATION_KIND = {
  COMPUTED: 'computed',
  UNAVAILABLE: 'unavailable',
} as const;

export type HorizonSeries = {
  readonly run: RunSetup;
  readonly candles: readonly EngineCandle[];
  readonly sentiments: readonly (SentimentObservation | undefined)[] | undefined;
};

// O pedido ao pool: tudo que a thread precisa para uma estratégia num par (a thread não lê banco).
export type HorizonComputeRequest = {
  readonly strategy: StrategyVersion;
  readonly daily: HorizonSeries;
  readonly intraday: HorizonSeries;
};

// O que UMA estratégia num par rende: o resumo dos prazos de dias e o veredito de 15 minutos (`null` sem candles).
export type HorizonLine = {
  readonly summaries: readonly HorizonSummary[];
  readonly intraday: IntradaySummary | null;
};

export type HorizonComputation =
  | { readonly kind: typeof HORIZON_COMPUTATION_KIND.COMPUTED; readonly line: HorizonLine }
  | { readonly kind: typeof HORIZON_COMPUTATION_KIND.UNAVAILABLE; readonly reason: string };

// Os sinais saem UMA vez e servem aos três prazos (RNF02 do spec 003).
function summarizeDaily(strategy: StrategyVersion, series: HorizonSeries): HorizonSummary[] {
  const { run, candles, sentiments } = series;
  assertGoalSeries({ run, candles, sentiments });
  const signals = computeGoalSignals({ strategy, run, candles, sentiments });
  const initial = toEngineDecimal(run.parameters.initialBalance);
  return HORIZON_DAYS.map((horizonDays) =>
    summarizeHorizon({
      horizonDays,
      windows: computeHorizonWindows({
        strategy,
        run,
        candles,
        signals,
        initial,
        horizonCandles: horizonCandlesOf(horizonDays, run.parameters.timeframe),
      }),
    }),
  );
}

// Candle de 15 minutos que o motor recusa deixa só a linha rápida sem número; os prazos de dias seguem.
function summarizeIntraday(
  strategy: StrategyVersion,
  series: HorizonSeries,
): IntradaySummary | null {
  try {
    return runIntradayInMemory({ strategy, ...series });
  } catch (error: unknown) {
    if (error instanceof EngineInputError) return null;
    throw error;
  }
}

// O cálculo puro e síncrono, o MESMO que a thread do pool roda: a API nunca o chama na própria thread.
export function computeHorizonLine(request: HorizonComputeRequest): HorizonComputation {
  try {
    const summaries = summarizeDaily(request.strategy, request.daily);
    const intraday = summarizeIntraday(request.strategy, request.intraday);
    return { kind: HORIZON_COMPUTATION_KIND.COMPUTED, line: { summaries, intraday } };
  } catch (error: unknown) {
    if (!(error instanceof GoalInputError)) throw error;
    return { kind: HORIZON_COMPUTATION_KIND.UNAVAILABLE, reason: error.code };
  }
}
