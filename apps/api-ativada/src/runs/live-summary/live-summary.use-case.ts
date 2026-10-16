// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { LiveRunSummaryRow, OwnerScope, RunLiveStatusRepository } from '@ativada/database';
import { ENGINE_TIMEFRAME_DURATION_MILLISECONDS } from '@ativada/strategy-engine';

import { computeBuyAndHold, computeLiveBalance } from '../live-status/live-balance.js';
import type { BuyAndHoldComparison } from '../live-status/live-status.constant.js';
import { ANALYST_REQUEST_MODE, type AnalystRequestMode } from '../run-analyst-request.js';

export type LiveSummaryDependencies = {
  readonly live: Pick<RunLiveStatusRepository, 'listLiveSummaries'>;
};

export type LiveSummaryItemView = {
  readonly runId: string;
  readonly strategyName: string;
  readonly analystMode: AnalystRequestMode | null;
  readonly initialBalance: string;
  readonly balance: string;
  readonly result: string;
  readonly resultRate: string;
  readonly buyAndHold: {
    readonly resultRate: string;
    readonly differencePoints: string;
    readonly comparison: BuyAndHoldComparison;
  } | null;
  readonly buyCount: number;
  readonly sellCount: number;
  // Fechamento (ms UTC) da vela da última decisão gravada; `null` antes da primeira vela fechar.
  readonly lastDecisionAt: number | null;
  readonly isWaitingForData: boolean;
};

export type LiveSummaryView = { readonly items: readonly LiveSummaryItemView[] };

export type LiveSummaryUseCase = (scope: OwnerScope) => Promise<LiveSummaryView>;

function readAnalystMode(value: string | undefined): AnalystRequestMode | null {
  return Object.values(ANALYST_REQUEST_MODE).find((mode) => mode === value) ?? null;
}

function readDuration(timeframe: string): number {
  const entry = Object.entries(ENGINE_TIMEFRAME_DURATION_MILLISECONDS).find(
    ([name]) => name === timeframe,
  );
  if (entry === undefined) throw new Error('Vela gravada desconhecida.');
  return entry[1];
}

function toBuyAndHold(
  row: LiveRunSummaryRow,
  balance: { readonly initial: string; readonly current: string },
): LiveSummaryItemView['buyAndHold'] {
  if (row.latestBenchmark === undefined) return null;
  const { resultRate, differencePoints, comparison } = computeBuyAndHold({
    initial: balance.initial,
    current: balance.current,
    benchmark: row.latestBenchmark,
  });
  return { resultRate, differencePoints, comparison };
}

function toItem(row: LiveRunSummaryRow): LiveSummaryItemView {
  const balance = computeLiveBalance({
    initial: row.initialBalance,
    latestEquity: row.latestEquity,
  });
  return {
    runId: row.runId,
    strategyName: row.strategyName,
    analystMode: readAnalystMode(row.analystMode),
    initialBalance: balance.initial,
    balance: balance.current,
    result: balance.result,
    resultRate: balance.resultRate,
    buyAndHold: toBuyAndHold(row, balance),
    buyCount: row.buyCount,
    sellCount: row.sellCount,
    lastDecisionAt:
      row.lastDecisionCandleTime === undefined
        ? null
        : row.lastDecisionCandleTime + readDuration(row.timeframe),
    isWaitingForData: row.isWaitingForData,
  };
}

// Todas as simulações ao vivo ativas do dono numa ida só ao banco (Visão geral): o saldo vem do último ponto gravado, sem
// reexecutar o motor, e o dono é filtrado dentro da consulta.
export function createLiveSummaryUseCase(
  dependencies: LiveSummaryDependencies,
): LiveSummaryUseCase {
  return async (scope) => {
    const rows = await dependencies.live.listLiveSummaries(scope);
    return { items: rows.map(toItem) };
  };
}
