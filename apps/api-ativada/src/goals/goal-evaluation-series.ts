// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SentimentObservationRepository } from '@ativada/database';
import { resolveSymbolFilters } from '@ativada/market-data-crypto';
import {
  createRunSetup,
  RUN_PARAMETERS_SCHEMA_VERSION,
  type EngineCandle,
  type EngineTimeframe,
  type RunSetup,
  type SentimentObservation,
} from '@ativada/strategy-engine';

import { DEFAULT_SENTIMENT_SOURCE } from '../runs/runs.constant.js';
import {
  loadGoalSentiments,
  loadGoalSeries,
  type GoalSeriesReader,
} from './goal-evaluation-candles.js';
import { GOAL_EVALUATION_TIMEFRAME, GOAL_INITIAL_BALANCE } from './goal.constant.js';

export type SymbolSeries = {
  readonly symbol: string;
  readonly run: RunSetup;
  readonly candles: readonly EngineCandle[];
  // O sentimento é lido do banco só se uma estratégia o usar, e uma vez por par.
  readonly loadSentiments: () => Promise<readonly (SentimentObservation | undefined)[]>;
};

export type SeriesReader = GoalSeriesReader & {
  readonly sentiments: Pick<SentimentObservationRepository, 'listAvailable'>;
};

export function setupFor(
  symbol: string,
  timeframe: EngineTimeframe = GOAL_EVALUATION_TIMEFRAME,
): RunSetup {
  return createRunSetup({
    schemaVersion: RUN_PARAMETERS_SCHEMA_VERSION,
    symbol,
    timeframe,
    sentimentSource: DEFAULT_SENTIMENT_SOURCE,
    initialBalance: GOAL_INITIAL_BALANCE,
    ...resolveSymbolFilters(symbol),
  });
}

// Os candles já lidos de um par num timeframe, com o sentimento carregado só se alguém o pedir (e uma vez).
export function buildSymbolSeries(
  reader: SeriesReader,
  params: {
    readonly symbol: string;
    readonly run: RunSetup;
    readonly candles: readonly EngineCandle[];
  },
): SymbolSeries {
  const { candles } = params;
  let pending: Promise<readonly (SentimentObservation | undefined)[]> | undefined;
  return {
    symbol: params.symbol,
    run: params.run,
    candles,
    loadSentiments: (): Promise<readonly (SentimentObservation | undefined)[]> => {
      pending ??= loadGoalSentiments(reader.sentiments, {
        candles,
        source: DEFAULT_SENTIMENT_SOURCE,
      });
      return pending;
    },
  };
}

export async function loadSymbolSeries(
  reader: SeriesReader,
  params: { readonly symbol: string; readonly now: number },
): Promise<SymbolSeries> {
  const candles = await loadGoalSeries(reader, params);
  return buildSymbolSeries(reader, {
    symbol: params.symbol,
    run: setupFor(params.symbol),
    candles,
  });
}
