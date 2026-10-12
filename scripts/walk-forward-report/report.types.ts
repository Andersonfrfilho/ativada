// Copyright (c) 2026 Ada Technology. All rights reserved.
export type DecimalText = string | null;

export type WindowSummary = {
  readonly index: number;
  readonly trainStart: number;
  readonly testStart: number;
  readonly testEnd: number;
  readonly isEligible: boolean;
  readonly assignment: Readonly<Record<string, string | number>>;
  readonly inSampleSharpe: DecimalText;
  readonly inSampleTrades: number;
  readonly trades: number;
  readonly totalReturn: DecimalText;
  readonly benchmarkReturn: DecimalText;
  readonly maxDrawdown: DecimalText;
  readonly winRate: DecimalText;
};

export type OverfittingSummary = {
  readonly isAlert: boolean;
  readonly reasons: readonly string[];
  readonly inSampleSharpe: DecimalText;
  readonly outOfSampleSharpe: DecimalText;
  readonly degradation: DecimalText;
  readonly eligibleWindows: number;
  readonly totalWindows: number;
};

export type RunSummary = {
  readonly windows: readonly WindowSummary[];
  readonly totalReturn: DecimalText;
  readonly benchmarkReturn: DecimalText;
  readonly excessReturn: DecimalText;
  readonly annualizedReturn: DecimalText;
  readonly sharpe: DecimalText;
  readonly sortino: DecimalText;
  readonly winRate: DecimalText;
  readonly profitFactor: DecimalText;
  readonly exposure: DecimalText;
  readonly maxDrawdownDepth: string;
  readonly maxDrawdownDays: number;
  readonly trades: number;
  readonly feesPaid: string;
  readonly netProfit: string;
  readonly testCandles: number;
  readonly liquidatedAtWindowEnd: number;
  readonly overfitting: OverfittingSummary;
};

export type WindowStats = {
  readonly windows: number;
  readonly eligibleWindows: number;
  readonly positiveWindows: number;
  readonly meanReturn: DecimalText;
  readonly medianReturn: DecimalText;
  readonly worstReturn: DecimalText;
  readonly bestReturn: DecimalText;
  readonly meanTrades: DecimalText;
  readonly lostOutOfSample: number;
  readonly belowBenchmark: number;
};

export type NeighborResult = {
  readonly label: string;
  readonly changedPath: string | null;
  readonly summary: RunSummary;
};

export type ScenarioReport = {
  readonly symbol: string;
  readonly timeframe: '1h' | '1d';
  readonly candleCount: number;
  readonly firstOpenTime: number;
  readonly lastCloseTime: number;
  readonly digest: string;
  readonly periodStart: number;
  readonly periodEnd: number;
  readonly leadInCandles: number;
  readonly combinations: number;
  readonly minTradesPerWindow: number;
  readonly buyAndHoldWholePeriod: DecimalText;
  readonly withCosts: RunSummary;
  readonly withoutCosts: RunSummary;
  readonly neighbors: readonly NeighborResult[];
  readonly elapsedSeconds: number;
};

export type ReportInput = {
  readonly generatedAt: string;
  readonly dataUntil: string;
  readonly commit: string;
  readonly isTreeClean: boolean;
  readonly engineVersions: string;
  readonly scenarios: readonly ScenarioReport[];
};
