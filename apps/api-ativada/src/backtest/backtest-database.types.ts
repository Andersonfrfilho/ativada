// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  EngineCheckpoint,
  JsonContainer,
  RunBatchWriter,
  RunRecord,
  RunStatus,
  StrategyVersionRecord,
} from '@ativada/database';
import type {
  EngineCandle,
  EquityPointDecision,
  MetricsClosedPosition,
  StoredSentimentObservation,
} from '@ativada/strategy-engine';

// Intervalo semi-aberto em milissegundos: `from` incluído, `to` excluído.
export type CandleWindow = {
  readonly from: number;
  readonly to: number;
};

// Observações da fonte com `observed_at` e `created_at` até `until` (o fechamento do último candle).
export type SentimentQuery = {
  readonly source: string;
  readonly until: number;
};

export type RunBlueprint = {
  readonly run: RunRecord;
  readonly version: StrategyVersionRecord;
};

export type StartRunResult =
  { readonly isStarted: true } | { readonly isStarted: false; readonly status: RunStatus };

// Tudo o que o backtest faz com uma execução, já preso ao dono dela: o escopo nasce em `attach` e não sai de lá.
export type BacktestRunSession = {
  readonly findRun: () => Promise<RunBlueprint | undefined>;
  readonly startRun: () => Promise<StartRunResult>;
  readonly readStatus: () => Promise<RunStatus | undefined>;
  readonly readCheckpoint: () => Promise<EngineCheckpoint | undefined>;
  readonly findCandles: (window: CandleWindow) => Promise<readonly EngineCandle[]>;
  readonly listSentiment: (query: SentimentQuery) => Promise<readonly StoredSentimentObservation[]>;
  readonly inBatch: <TResult>(
    work: (writer: RunBatchWriter) => Promise<TResult>,
  ) => Promise<TResult | undefined>;
  readonly readEquityPoints: () => Promise<readonly EquityPointDecision[]>;
  readonly readClosedPositions: () => Promise<readonly MetricsClosedPosition[]>;
  // `false`: a execução já não estava `running` (cancelada, ou encerrada por outro caminho).
  readonly completeRun: (metrics: JsonContainer) => Promise<boolean>;
  readonly failRun: (errorCode: string) => Promise<boolean>;
};

// `undefined` quando a execução não existe ou o dono dela não está ativo.
export type BacktestDatabase = {
  readonly attach: (runId: string) => Promise<BacktestRunSession | undefined>;
};
