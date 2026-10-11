// Copyright (c) 2026 Ada Technology. All rights reserved.
import { getTableName } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

import { alerts } from '../schema/alerts.schema.js';
import { auditEvents } from '../schema/audit-events.schema.js';
import { candles } from '../schema/candles.schema.js';
import { equityPoints } from '../schema/equity-points.schema.js';
import { fills } from '../schema/fills.schema.js';
import { goals } from '../schema/goals.schema.js';
import { orders } from '../schema/orders.schema.js';
import { positions } from '../schema/positions.schema.js';
import { priceAlerts } from '../schema/price-alerts.schema.js';
import { runCommands } from '../schema/run-commands.schema.js';
import { runs } from '../schema/runs.schema.js';
import { sentimentDaily } from '../schema/sentiment-daily.schema.js';
import { sentimentObservations } from '../schema/sentiment-observations.schema.js';
import { signals } from '../schema/signals.schema.js';
import { strategies, strategyVersions } from '../schema/strategies.schema.js';
import { telegramLinkCodes } from '../schema/telegram-link-codes.schema.js';
import { users } from '../schema/users.schema.js';
import { walkForwardWindows } from '../schema/walk-forward-windows.schema.js';

export {
  OWNED_TABLE_EXPORT_MODE,
  OWNED_TABLE_EXPORTS,
  type OwnedTableExportStep,
} from './owned-table-exports.js';

export type PseudonymizedTable = {
  readonly table: PgTable;
  readonly nullifiedColumns: readonly string[];
};

export const OWNED_TABLES: readonly PgTable[] = [
  telegramLinkCodes,
  strategies,
  strategyVersions,
  runs,
  signals,
  orders,
  fills,
  positions,
  equityPoints,
  runCommands,
  walkForwardWindows,
  alerts,
  goals,
  priceAlerts,
];

// Ordem da exclusão (ADR 0001 §h passo 3): filhas antes dos pais, porque a FK é ON DELETE RESTRICT.
export const OWNED_TABLE_DELETION_ORDER: readonly PgTable[] = [
  telegramLinkCodes,
  alerts,
  equityPoints,
  runCommands,
  walkForwardWindows,
  fills,
  positions,
  orders,
  signals,
  runs,
  goals,
  priceAlerts,
  strategyVersions,
  strategies,
];

export const PSEUDONYMIZED_TABLES: readonly PseudonymizedTable[] = [
  { table: auditEvents, nullifiedColumns: ['actor_user_id', 'target_id', 'ip'] },
];

export const SHARED_TABLES: readonly PgTable[] = [users];

// Dados públicos de mercado, sem dono e sem user_id (ADR 0001 §h): tabela sem dono nova entra aqui de propósito.
export const UNOWNED_PUBLIC_TABLES: readonly PgTable[] = [
  candles,
  sentimentDaily,
  sentimentObservations,
];

export function tableNameOf(table: PgTable): string {
  return getTableName(table);
}
