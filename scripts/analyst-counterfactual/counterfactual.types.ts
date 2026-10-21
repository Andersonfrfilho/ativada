// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  EngineCandle,
  EngineMarket,
  StoredSentimentObservation,
} from '../../packages/strategy-engine/src/index.js';

export type StrategyKey = 'classic' | 'reversion';

// O que o contrafactual lê do banco (só `SELECT`) e passa para a memória: a série do par e o Fear & Greed.
export type PairData = {
  readonly market: EngineMarket;
  readonly candles: readonly EngineCandle[];
  readonly observations: readonly StoredSentimentObservation[];
};

export type EquityRecord = {
  readonly candleTime: number;
  readonly equity: string;
  readonly equityAtLow: string;
};

// O que uma execução em memória deixou: nada disto vai a uma tabela.
export type SimulationOutcome = {
  readonly equity: readonly EquityRecord[];
  readonly entries: number;
  readonly closedPositions: number;
  readonly feesPaid: string;
  readonly finalEquity: string;
  readonly maxDrawdownAtLow: string;
};

// O que o relatório precisa de uma execução (a curva inteira de patrimônio fica na memória e não vai ao arquivo).
export type SimulationSummary = Omit<SimulationOutcome, 'equity'>;

export type AnalystTally = {
  readonly decisions: number;
  readonly failed: number;
  readonly postures: Readonly<Record<string, number>>;
  readonly reasons: Readonly<Record<string, number>>;
  readonly gateClosed: number;
  // Ordens de entrada criadas, pelo teto de entrada daquela vela (`0.25`, `0.5`, `1`); a escala `0` não cria ordem.
  readonly entryOrders: Readonly<Record<string, number>>;
  readonly commands: Readonly<Record<string, number>>;
};

export type WindowResult = {
  readonly index: number;
  readonly startTime: number;
  readonly baselineNet: string;
  readonly analystNet: string;
  readonly delta: string;
};

export type JobResult = {
  readonly symbol: string;
  readonly strategy: StrategyKey;
  readonly strategyLabel: string;
  readonly initialBalance: string;
  readonly periodStart: number;
  readonly periodEnd: number;
  readonly candles: number;
  readonly baseline: SimulationSummary;
  readonly withAnalyst: SimulationSummary;
  // O analista sem o corte de tamanho: só a pausa e a saída por tempo (toda entrada liberada sai no tamanho cheio).
  readonly gateOnly: SimulationSummary;
  readonly tally: AnalystTally;
  readonly windows: readonly WindowResult[];
};
