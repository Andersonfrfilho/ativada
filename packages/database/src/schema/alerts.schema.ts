// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  check,
  type CheckBuilder,
  foreignKey,
  index,
  type IndexBuilder,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  ALERT_CHANNEL,
  ALERT_ERROR_CODE_MAX_LENGTH,
  ALERT_SIDE,
  ALERT_STATUS,
} from '../alerts/alert.constant.js';
import { literalList } from './check-literals.js';
import { runs } from './runs.schema.js';
import { users } from './users.schema.js';

// O lado PRICE (alerta de preço) não tem execução e leva o alerta; os outros lados são o contrário. Único por (alerta, instante).
function priceAlertConstraints(table: {
  readonly side: AnyPgColumn;
  readonly runId: AnyPgColumn;
  readonly priceAlertId: AnyPgColumn;
  readonly candleTime: AnyPgColumn;
}): readonly (CheckBuilder | IndexBuilder)[] {
  const isPrice = sql`(${table.side} = ${literalList([ALERT_SIDE.PRICE])})`;
  return [
    uniqueIndex('alerts_price_alert_id_candle_time_unique')
      .on(table.priceAlertId, table.candleTime)
      .where(sql`${table.priceAlertId} is not null`),
    check('alerts_price_has_no_run_check', sql`${isPrice} = (${table.runId} is null)`),
    check('alerts_price_alert_id_check', sql`${isPrice} = (${table.priceAlertId} is not null)`),
  ];
}

// Caixa de saída durável dos alertas de sinal (RF10): a linha nasce na MESMA transação do passo e o despachante a entrega
// depois. A chave (execução, candle, lado, canal) impede alerta repetido; o chat NÃO é copiado para cá, é lido de `users` no envio.
export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    runId: uuid('run_id'),
    // O alerta de preço que disparou (lado PRICE); sem FK de propósito: apagar o alerta não leva o aviso já enfileirado.
    priceAlertId: uuid('price_alert_id'),
    candleTime: bigint('candle_time', { mode: 'number' }).notNull(),
    side: varchar('side', { length: 8 }).notNull(),
    channel: varchar('channel', { length: 16 }).notNull(),
    payload: jsonb('payload').notNull(),
    status: varchar('status', { length: 16 }).notNull().default(ALERT_STATUS.PENDING),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastError: varchar('last_error', { length: ALERT_ERROR_CODE_MAX_LENGTH }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: 'alerts_run_id_user_id_fk',
      columns: [table.runId, table.userId],
      foreignColumns: [runs.id, runs.userId],
    }).onDelete('restrict'),
    uniqueIndex('alerts_run_id_candle_time_side_channel_unique').on(
      table.runId,
      table.candleTime,
      table.side,
      table.channel,
    ),
    ...priceAlertConstraints(table),
    index('alerts_user_id_created_at_idx').on(table.userId, table.createdAt.desc()),
    index('alerts_pending_next_attempt_idx')
      .on(table.nextAttemptAt)
      .where(sql`${table.status} = ${literalList([ALERT_STATUS.PENDING])}`),
    check('alerts_side_check', sql`${table.side} in (${literalList(Object.values(ALERT_SIDE))})`),
    check(
      'alerts_channel_check',
      sql`${table.channel} in (${literalList(Object.values(ALERT_CHANNEL))})`,
    ),
    check(
      'alerts_status_check',
      sql`${table.status} in (${literalList(Object.values(ALERT_STATUS))})`,
    ),
    check('alerts_attempts_check', sql`${table.attempts} >= 0`),
    check(
      'alerts_sent_matches_status_check',
      sql`(${table.status} = ${literalList([ALERT_STATUS.SENT])}) = (${table.sentAt} is not null)`,
    ),
  ],
);
