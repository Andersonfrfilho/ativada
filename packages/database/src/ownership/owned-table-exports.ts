// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { PgTable } from 'drizzle-orm/pg-core';

import { alerts } from '../schema/alerts.schema.js';
import { equityPoints } from '../schema/equity-points.schema.js';
import { fills } from '../schema/fills.schema.js';
import { goals } from '../schema/goals.schema.js';
import { orders } from '../schema/orders.schema.js';
import { positions } from '../schema/positions.schema.js';
import { runCommands } from '../schema/run-commands.schema.js';
import { runs } from '../schema/runs.schema.js';
import { signals } from '../schema/signals.schema.js';
import { strategies, strategyVersions } from '../schema/strategies.schema.js';
import { telegramLinkCodes } from '../schema/telegram-link-codes.schema.js';
import { walkForwardWindows } from '../schema/walk-forward-windows.schema.js';
export const OWNED_TABLE_EXPORT_MODE = {
  COLUMNS: 'columns',
  EXCLUDED: 'excluded',
} as const;

export type OwnedTableExportStep = {
  readonly table: PgTable;
} & (
  | {
      readonly mode: typeof OWNED_TABLE_EXPORT_MODE.COLUMNS;
      readonly columns: readonly string[];
    }
  | {
      readonly mode: typeof OWNED_TABLE_EXPORT_MODE.EXCLUDED;
      readonly reason: string;
    }
);

function exportColumns(table: PgTable, columns: readonly string[]): OwnedTableExportStep {
  return { table, mode: OWNED_TABLE_EXPORT_MODE.COLUMNS, columns };
}

// Cada tabela de dono declara aqui o que a exportação leva (lista de propriedades do schema Drizzle);
// ficam de fora o hash do código de vínculo (segredo transitório), os hashes de configuração e de
// parâmetros (derivados) e o `engineState` (estado técnico do motor, reconstruível).
export const OWNED_TABLE_EXPORTS: readonly OwnedTableExportStep[] = [
  {
    table: telegramLinkCodes,
    mode: OWNED_TABLE_EXPORT_MODE.COLUMNS,
    columns: ['expiresAt', 'attempts', 'createdAt'],
  },
  exportColumns(strategies, ['id', 'name', 'isExample', 'createdAt', 'updatedAt', 'deletedAt']),
  exportColumns(strategyVersions, ['id', 'strategyId', 'version', 'config', 'createdAt']),
  exportColumns(runs, [
    'id',
    'strategyVersionId',
    'kind',
    'status',
    'symbol',
    'timeframe',
    'runParameters',
    'engineVersion',
    'signalEngineVersion',
    'metricsVersion',
    'periodStart',
    'periodEnd',
    'lastCandleTime',
    'metrics',
    'progress',
    'errorCode',
    'migratedFromRunId',
    'request',
    'goalId',
    'goalOutcome',
    'goalOutcomeCandleTime',
    'createdAt',
    'startedAt',
    'finishedAt',
  ]),
  exportColumns(signals, [
    'runId',
    'candleTime',
    'action',
    'score',
    'regime',
    'votes',
    'indicators',
    'sentimentObservation',
    'reason',
  ]),
  exportColumns(orders, [
    'runId',
    'engineKey',
    'side',
    'type',
    'purpose',
    'status',
    'reason',
    'quantity',
    'price',
    'limitPrice',
    'triggerPrice',
    'riskAmount',
    'stopDistance',
    'targetDistance',
    'eligibleCandles',
    'createdCandleTime',
    'expiresCandleTime',
    'lastEventCandleTime',
  ]),
  exportColumns(fills, [
    'runId',
    'orderKey',
    'positionKey',
    'candleTime',
    'side',
    'price',
    'quantity',
    'notional',
    'fee',
  ]),
  exportColumns(positions, [
    'runId',
    'engineKey',
    'status',
    'entryPrice',
    'quantity',
    'stopPrice',
    'targetPrice',
    'entryFee',
    'exitPrice',
    'exitFee',
    'netProfit',
    'exitReason',
    'openedCandleTime',
    'closedCandleTime',
  ]),
  exportColumns(equityPoints, ['runId', 'candleTime', 'equity', 'equityAtLow', 'benchmark']),
  exportColumns(runCommands, [
    'runId',
    'commandId',
    'kind',
    'reason',
    'issuedAt',
    'candleTime',
    'status',
  ]),
  exportColumns(walkForwardWindows, [
    'runId',
    'windowIndex',
    'trainStart',
    'trainEnd',
    'testStart',
    'testEnd',
    'bestParams',
    'status',
    'inSample',
    'outOfSample',
    'eligibleCombinations',
    'createdAt',
  ]),
  exportColumns(goals, [
    'id',
    'symbol',
    'targetRate',
    'horizonDays',
    'maxLossRate',
    'isActive',
    'createdAt',
    'updatedAt',
  ]),
  exportColumns(alerts, [
    'id',
    'runId',
    'candleTime',
    'side',
    'channel',
    'payload',
    'status',
    'attempts',
    'lastError',
    'createdAt',
    'sentAt',
  ]),
];
