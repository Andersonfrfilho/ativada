// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonContainer, WalkForwardWindowInput } from '@ativada/database';
import { z } from '@ativada/environment';
import {
  EXIT_REASON,
  type ChainedWindowResult,
  type GridCombination,
  type MetricsClosedPosition,
  type ParameterSelection,
  type RunMetrics,
  type WalkForwardWindow,
} from '@ativada/strategy-engine';

import { toJsonContainer } from './to-json-container.js';
import type { WindowSummary } from './search-input.js';

// O que a leitura da janela gravada precisa de volta (o encadeamento da retomada e o relatório final).
const TRADE_SCHEMA = z.strictObject({
  openedCandleOpenTime: z.int(),
  candleOpenTime: z.int(),
  entryFee: z.string(),
  exitFee: z.string(),
  netProfit: z.string(),
  exitReason: z.enum(Object.values(EXIT_REASON)),
});

export const OUT_OF_SAMPLE_RECORD_SCHEMA = z.looseObject({
  scale: z.string(),
  endEquity: z.string(),
  endBenchmark: z.string(),
  liquidatedAtWindowEnd: z.boolean(),
  trades: z.array(TRADE_SCHEMA),
});

export const IN_SAMPLE_RECORD_SCHEMA = z.looseObject({
  sharpe: z.string().nullable(),
  points: z.int().min(0),
});

export type OutOfSampleRecord = z.infer<typeof OUT_OF_SAMPLE_RECORD_SCHEMA>;
export type InSampleRecord = z.infer<typeof IN_SAMPLE_RECORD_SCHEMA>;

// Parâmetros escolhidos: só o que reconstrói a combinação (índice na grade e atribuição), nunca o hash.
export function buildBestParams(combination: GridCombination): JsonContainer {
  return toJsonContainer({
    combinationIndex: combination.index,
    assignment: combination.assignment,
  });
}

export function buildInSampleRecord(params: {
  readonly summary: WindowSummary;
  readonly metrics: RunMetrics;
  readonly candidates: number;
  readonly eligibleCombinations: number;
}): JsonContainer {
  return toJsonContainer({
    sharpe: params.summary.sharpe,
    points: params.summary.points,
    trades: params.summary.trades,
    candidates: params.candidates,
    eligibleCombinations: params.eligibleCombinations,
    metrics: params.metrics,
  });
}

export function buildParkedInSampleRecord(params: { readonly candidates: number }): JsonContainer {
  return toJsonContainer({
    sharpe: null,
    points: 0,
    trades: 0,
    candidates: params.candidates,
    eligibleCombinations: 0,
    metrics: null,
  });
}

export function buildOutOfSampleRecord(params: {
  readonly chained: ChainedWindowResult;
  readonly metrics: RunMetrics;
  readonly isParked: boolean;
}): JsonContainer {
  const { chained } = params;
  return toJsonContainer({
    scale: chained.scale,
    endEquity: chained.endEquity,
    endBenchmark: chained.endBenchmark,
    liquidatedAtWindowEnd: chained.liquidatedAtWindowEnd,
    isParked: params.isParked,
    points: chained.equityPoints.length,
    trades: chained.trades satisfies readonly MetricsClosedPosition[],
    metrics: params.metrics,
  });
}

export type BuildWindowRowParams = {
  readonly window: WalkForwardWindow;
  readonly selection: ParameterSelection;
  readonly bestParams: JsonContainer | undefined;
  readonly inSample: JsonContainer;
  readonly outOfSample: JsonContainer;
};

export function buildWindowRow(params: BuildWindowRowParams): WalkForwardWindowInput {
  const { window, selection } = params;
  return {
    windowIndex: window.index,
    trainStart: window.trainStart,
    trainEnd: window.trainEnd,
    testStart: window.testStart,
    testEnd: window.testEnd,
    bestParams: params.bestParams,
    status: selection.status,
    inSample: params.inSample,
    outOfSample: params.outOfSample,
    eligibleCombinations: selection.eligibleCount,
  };
}
