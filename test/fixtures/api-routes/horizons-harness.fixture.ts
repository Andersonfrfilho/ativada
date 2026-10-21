// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CandleRecord } from '../../../packages/database/src/index.js';
import type { SentimentObservationRepository } from '../../../packages/database/src/sentiment/sentiment-observation.types.js';
import type { HorizonComputeRequest } from '../../../apps/api-ativada/src/horizons/horizon-computation.js';
import type { EvaluateHorizonsUseCase } from '../../../apps/api-ativada/src/horizons/horizon-evaluation.use-case.js';
import type { Route } from '../../../apps/api-ativada/src/router/route.types.js';
import btcHourly from '../strategy-engine/market/btcusdt-1h-500.json' with { type: 'json' };
import { buildDailyCandles, GOAL_SYMBOLS } from './goals-harness.fixture.js';
import {
  createRunsHarness,
  EXCHANGE,
  NOW,
  type RunsHarness,
  type RunsHarnessOptions,
} from './runs-harness.fixture.js';

const QUARTER = 900_000;
const QUARTERS_PER_HOUR = 4;

type BinanceRow = readonly (string | number)[];

function decimalOf(value: string | number | undefined): number {
  return Number(value);
}

// Os 500 candles de 1 h REAIS do BTCUSDT, cada um partido em quatro de 15 min (abertura e fechamento interpolados entre
// os da hora, máxima e mínima da hora), terminando no último quarto de hora fechado antes do `NOW` do harness.
export function buildIntradayCandles(symbols: readonly string[]): CandleRecord[] {
  const rows = btcHourly as readonly BinanceRow[];
  const total = rows.length * QUARTERS_PER_HOUR;
  const lastOpen = Math.floor(NOW / QUARTER) * QUARTER - QUARTER;
  const firstOpen = lastOpen - (total - 1) * QUARTER;
  return symbols.flatMap((symbol) =>
    rows.flatMap((row, hour) =>
      Array.from({ length: QUARTERS_PER_HOUR }, (_unused, quarter): CandleRecord => {
        const open = decimalOf(row[1]);
        const close = decimalOf(row[4]);
        const step = (close - open) / QUARTERS_PER_HOUR;
        const quarterOpen = open + step * quarter;
        const quarterClose = quarterOpen + step;
        const openTime = firstOpen + (hour * QUARTERS_PER_HOUR + quarter) * QUARTER;
        return {
          exchange: EXCHANGE,
          symbol,
          timeframe: '15m',
          openTime,
          closeTime: openTime + QUARTER - 1,
          open: quarterOpen.toFixed(8),
          high: Math.max(decimalOf(row[2]), quarterOpen, quarterClose).toFixed(8),
          low: Math.min(decimalOf(row[3]), quarterOpen, quarterClose).toFixed(8),
          close: quarterClose.toFixed(8),
          volume: (decimalOf(row[5]) / QUARTERS_PER_HOUR).toFixed(8),
          tradeCount: Math.floor(Number(row[8]) / QUARTERS_PER_HOUR),
        };
      }),
    ),
  );
}

export type HorizonsHarness = RunsHarness & {
  // O mesmo vetor que o repositório em memória lê: um teste que acrescenta ou remove candle muda o que a API enxerga.
  readonly candleRecords: CandleRecord[];
  // `count`: cálculos pedidos ao pool (um por estratégia que errou o cache). `hold`: enquanto existir, cada cálculo
  // espera por ela, o que mantém uma avaliação a frio "em voo" para os testes do portão.
  readonly computations: {
    count: number;
    hold: Promise<void> | undefined;
    readonly requests: HorizonComputeRequest[];
    readonly signals: (AbortSignal | undefined)[];
    // O primeiro cálculo pedido falha (o pool perdeu a thread): os demais devem ser cancelados.
    failFirst: boolean;
  };
  readonly evaluateHorizons: EvaluateHorizonsUseCase;
};

export type HorizonsHarnessOptions = Pick<RunsHarnessOptions, 'queuePerUserLimit'> & {
  readonly symbols?: readonly string[];
  // Teto global de avaliações a frio simultâneas (padrão alto: só os testes do portão o baixam).
  readonly maxConcurrentColdEvaluations?: number;
};

const DEFAULT_MAX_CONCURRENT_COLD_EVALUATIONS = 8;

const NO_SENTIMENT: Pick<SentimentObservationRepository, 'listAvailable'> = {
  listAvailable: () => Promise.resolve([]),
};

export async function createHorizonsHarness(
  options: HorizonsHarnessOptions = {},
): Promise<HorizonsHarness> {
  const symbols = options.symbols ?? GOAL_SYMBOLS;
  const candleRecords = [...buildDailyCandles(symbols), ...buildIntradayCandles(symbols)];
  const computations: HorizonsHarness['computations'] = {
    count: 0,
    hold: undefined,
    requests: [],
    signals: [],
    failFirst: false,
  };
  let evaluateHorizons: EvaluateHorizonsUseCase | undefined;
  const harness = await createRunsHarness({
    candles: candleRecords,
    symbols,
    ...(options.queuePerUserLimit === undefined
      ? {}
      : { queuePerUserLimit: options.queuePerUserLimit }),
    extraRoutes: (app, parts): readonly Route[] => {
      const coldBudget = app.goalColdBudget.createGoalColdBudget({
        rateLimiter: app.rateLimiter.createRateLimiter({ now: () => parts.clock.now }),
      });
      evaluateHorizons = app.horizonEvaluation.createHorizonEvaluationUseCase({
        strategies: parts.strategies.repository,
        candles: parts.candles.repository,
        sentiments: NO_SENTIMENT,
        exchange: EXCHANGE,
        now: () => parts.clock.now,
        cache: app.horizonCache.createHorizonCache(),
        computeHorizon: async (request, signal) => {
          computations.count += 1;
          computations.requests.push(request);
          computations.signals.push(signal);
          if (computations.failFirst && computations.count === 1) throw new Error('thread perdida');
          await computations.hold;
          return app.horizonComputation.computeHorizonLine(request);
        },
        coldGate: app.goalColdGate.createColdEvaluationGate({
          maxConcurrent:
            options.maxConcurrentColdEvaluations ?? DEFAULT_MAX_CONCURRENT_COLD_EVALUATIONS,
          budget: coldBudget,
        }),
      });
      return app.horizonRoutes.createHorizonRoutes({
        enabledSymbols: symbols,
        evaluateHorizons,
      });
    },
  });
  if (evaluateHorizons === undefined) throw new Error('os prazos não foram montados');
  return { ...harness, candleRecords, computations, evaluateHorizons };
}
