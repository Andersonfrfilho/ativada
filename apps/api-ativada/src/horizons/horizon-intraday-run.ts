// Copyright (c) 2026 Ada Technology. All rights reserved.
import { advanceCandle } from '@ativada/run-recording';
import {
  computeOpenPositionMetrics,
  computeRunMetrics,
  createEngine,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  summarizeIntraday,
  type ClosedPositionDecision,
  type EngineCandle,
  type EngineState,
  type EquityPointDecision,
  type IntradaySummary,
  type RunSetup,
  type SentimentObservation,
  type StrategyVersion,
} from '@ativada/strategy-engine';

export type IntradayRunParams = {
  readonly strategy: StrategyVersion;
  readonly run: RunSetup;
  readonly candles: readonly EngineCandle[];
  readonly sentiments: readonly (SentimentObservation | undefined)[] | undefined;
};

type Recorded = {
  readonly equityPoints: EquityPointDecision[];
  readonly closedPositions: ClosedPositionDecision[];
  state: EngineState;
};

// O passo do backtest (`advanceCandle`, o único do produto) sobre a série, SEM gravar nada: os pontos de patrimônio e as
// operações fechadas ficam na memória e viram o veredito pelas métricas do backtest.
function stepAll(params: IntradayRunParams): Recorded {
  const { strategy, run, candles } = params;
  const engine = createEngine();
  const sentimentByOpenTime = new Map(
    candles.map((candle, index) => [candle.openTime, params.sentiments?.[index]]),
  );
  const recorded: Recorded = {
    equityPoints: [],
    closedPositions: [],
    state: engine.createInitialState({ strategy, run }),
  };
  let previousOpenTime: number | null = null;
  for (const candle of candles) {
    const { result } = advanceCandle({
      engine,
      strategy,
      setup: run,
      state: recorded.state,
      candle,
      previousOpenTime,
      durationMilliseconds: ENGINE_TIMEFRAME_DURATION_MILLISECONDS[run.parameters.timeframe],
      pickSentiment: (picked) => sentimentByOpenTime.get(picked.openTime),
    });
    recorded.state = result.state;
    previousOpenTime = candle.openTime;
    if (result.decisions.equityPoint !== null) {
      recorded.equityPoints.push(result.decisions.equityPoint);
    }
    recorded.closedPositions.push(...result.decisions.closedPositions);
  }
  return recorded;
}

// A linha de 15 minutos (spec 003 RF03, T2.3): `null` sem candle algum.
export function runIntradayInMemory(params: IntradayRunParams): IntradaySummary | null {
  const last = params.candles.at(-1);
  if (last === undefined) return null;
  const { run } = params;
  const recorded = stepAll(params);
  const metrics = computeRunMetrics({
    equityPoints: recorded.equityPoints,
    closedPositions: recorded.closedPositions.sort(
      (first, second) => first.candleOpenTime - second.candleOpenTime,
    ),
    openPosition: computeOpenPositionMetrics({
      wallet: recorded.state.wallet,
      lastClose: last.close,
      parameters: run.parameters,
    }),
    run: {
      initialBalance: run.parameters.initialBalance,
      timeframeMilliseconds: ENGINE_TIMEFRAME_DURATION_MILLISECONDS[run.parameters.timeframe],
    },
  });
  return summarizeIntraday(metrics);
}
