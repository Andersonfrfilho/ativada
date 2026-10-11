// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  numeric,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import {
  PRICE_ALERT_DIRECTION,
  PRICE_ALERT_ORIGIN,
  PRICE_ALERT_SYMBOL_MAX_LENGTH,
  PRICE_ALERT_SYMBOL_PATTERN,
} from '../price-alerts/price-alert.constant.js';
import { literalList } from './check-literals.js';
import { users } from './users.schema.js';

// O alerta de preço do usuário (RF14): "subir acima de" / "cair abaixo de" um valor, por par. Dispara UMA vez: a avaliação
// grava `triggered_at` e desliga o alerta no mesmo UPDATE; religar o rearma (limpa `triggered_at`). `UNIQUE (id, user_id)`
// existe para a caixa de saída de alertas referenciar o alerta por FK composta.
export const priceAlerts = pgTable(
  'price_alerts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    symbol: varchar('symbol', { length: PRICE_ALERT_SYMBOL_MAX_LENGTH }).notNull(),
    direction: varchar('direction', { length: 8 }).notNull(),
    value: numeric('value').notNull(),
    origin: varchar('origin', { length: 8 }).notNull(),
    isEnabled: boolean('is_enabled').notNull().default(true),
    triggeredAt: timestamp('triggered_at', { withTimezone: true }),
    // O último disparo, que religar NÃO apaga: é o que impõe o intervalo mínimo entre dois disparos do mesmo alerta.
    lastFiredAt: timestamp('last_fired_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('price_alerts_id_user_id_unique').on(table.id, table.userId),
    index('price_alerts_user_id_created_at_idx').on(
      table.userId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index('price_alerts_armed_symbol_idx')
      .on(table.symbol)
      .where(sql`${table.isEnabled} and ${table.triggeredAt} is null`),
    check(
      'price_alerts_symbol_check',
      sql`${table.symbol} ~ ${literalList([PRICE_ALERT_SYMBOL_PATTERN])}`,
    ),
    check(
      'price_alerts_direction_check',
      sql`${table.direction} in (${literalList(Object.values(PRICE_ALERT_DIRECTION))})`,
    ),
    check(
      'price_alerts_origin_check',
      sql`${table.origin} in (${literalList(Object.values(PRICE_ALERT_ORIGIN))})`,
    ),
    check('price_alerts_value_check', sql`${table.value} > 0`),
    check(
      'price_alerts_triggered_is_disabled_check',
      sql`${table.triggeredAt} is null or not ${table.isEnabled}`,
    ),
  ],
);
