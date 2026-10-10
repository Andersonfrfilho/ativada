// Copyright (c) 2026 Ada Technology. All rights reserved.
import { evaluateGoal } from '../../../packages/strategy-engine/src/index.js';
import type { CandleRecord } from '../../../packages/database/src/index.js';
import type { SentimentObservationRepository } from '../../../packages/database/src/sentiment/sentiment-observation.types.js';
import type { Route } from '../../../apps/api-cryptoada/src/router/route.types.js';
import ethDaily from '../strategy-engine/market/ethusdt-1d-400.json' with { type: 'json' };
import { createInMemoryGoals, type InMemoryGoals } from './in-memory-goals.fixture.js';
import {
  createRunsHarness,
  EXCHANGE,
  NOW,
  type RunsHarness,
  type RunsHarnessOptions,
} from './runs-harness.fixture.js';

export const GOAL_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'] as const;
const DAY = 86_400_000;
const SHIFT_DAYS_PER_SYMBOL = 15;

type BinanceRow = readonly (string | number)[];

// Os 400 candles diários REAIS do ETHUSDT replicados sob cada par, terminando no dia anterior ao `NOW` do harness: a
// avaliação roda o motor de verdade sobre dado real, sem fingir preço.
export function buildDailyCandles(symbols: readonly string[]): CandleRecord[] {
  const allRows = ethDaily as readonly BinanceRow[];
  const lastDay = Math.floor(NOW / DAY) * DAY - DAY;
  return symbols.flatMap((symbol, symbolIndex) => {
    // Cada par começa 15 dias depois do anterior: séries de tamanhos (e resultados) diferentes, todas terminando ontem.
    const rows = allRows.slice(symbolIndex * SHIFT_DAYS_PER_SYMBOL);
    const firstDay = lastDay - (rows.length - 1) * DAY;
    return rows.map((row, index): CandleRecord => {
      const openTime = firstDay + index * DAY;
      return {
        exchange: EXCHANGE,
        symbol,
        timeframe: '1d',
        openTime,
        closeTime: openTime + DAY - 1,
        open: String(row[1]),
        high: String(row[2]),
        low: String(row[3]),
        close: String(row[4]),
        volume: String(row[5]),
        tradeCount: Number(row[8]),
      };
    });
  });
}

export type GoalsHarness = RunsHarness & {
  // O mesmo vetor que o repositório em memória lê: um teste que acrescenta ou remove candle muda o que a API enxerga.
  readonly candleRecords: CandleRecord[];
  readonly goals: InMemoryGoals;
  readonly evaluations: { count: number };
  readonly sentimentReads: { count: number };
};

export type GoalsHarnessOptions = Pick<RunsHarnessOptions, 'queuePerUserLimit'> & {
  readonly symbols?: readonly string[];
  // Pares habilitados que não têm nenhum candle gravado.
  readonly symbolsWithoutCandles?: readonly string[];
  readonly maxGoals?: number;
};

const NO_SENTIMENT: Pick<SentimentObservationRepository, 'listAvailable'> = {
  listAvailable: () => Promise.resolve([]),
};

export async function createGoalsHarness(options: GoalsHarnessOptions = {}): Promise<GoalsHarness> {
  const withCandles = options.symbols ?? GOAL_SYMBOLS;
  const symbols = [...withCandles, ...(options.symbolsWithoutCandles ?? [])];
  const candleRecords = buildDailyCandles(withCandles);
  const goals = createInMemoryGoals();
  const evaluations = { count: 0 };
  const sentimentReads = { count: 0 };
  const harness = await createRunsHarness({
    candles: candleRecords,
    symbols,
    ...(options.queuePerUserLimit === undefined
      ? {}
      : { queuePerUserLimit: options.queuePerUserLimit }),
    extraRoutes: (app, parts): readonly Route[] => {
      const useCases = app.goalUseCases;
      const base = { goals: goals.repository, maxGoals: options.maxGoals ?? 20 };
      const evaluation = app.goalEvaluation.createGoalEvaluationUseCase({
        goals: goals.repository,
        strategies: parts.strategies.repository,
        candles: parts.candles.repository,
        sentiments: {
          listAvailable: (query) => {
            sentimentReads.count += 1;
            return NO_SENTIMENT.listAvailable(query);
          },
        },
        exchange: EXCHANGE,
        symbols,
        now: () => parts.clock.now,
        cache: app.goalCache.createGoalEvaluationCache(),
        evaluate: (request) => {
          evaluations.count += 1;
          return evaluateGoal(request);
        },
      });
      return app.goalRoutes.createGoalRoutes({
        enabledSymbols: symbols,
        createGoal: useCases.createCreateGoalUseCase(base),
        listGoals: useCases.createListGoalsUseCase(base),
        getGoal: useCases.createGetGoalUseCase(base),
        updateGoal: useCases.createUpdateGoalUseCase(base),
        deleteGoal: useCases.createDeleteGoalUseCase(base),
        evaluateGoal: evaluation,
      });
    },
  });
  return { ...harness, candleRecords, goals, evaluations, sentimentReads };
}
