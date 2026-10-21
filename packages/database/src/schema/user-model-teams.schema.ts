// Copyright (c) 2026 Ada Technology. All rights reserved.
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  pgTable,
  primaryKey,
  smallint,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { MODEL_TEAM_KEYS } from '../model-teams/model-team.constant.js';
import { literalList } from './check-literals.js';
import { users } from './users.schema.js';

// O interruptor de cada equipe de modelo por usuário (padrão desligado: custo é opt-in) e o contador diário do pedido avulso,
// que substitui guardar quem pediu cada relatório (RNF09).
export const userModelTeams = pgTable(
  'user_model_teams',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    teamKey: varchar('team_key', { length: 8 }).notNull(),
    isEnabled: boolean('enabled').notNull().default(false),
    onDemandDay: date('on_demand_day', { mode: 'string' }),
    onDemandCount: smallint('on_demand_count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'user_model_teams_pkey', columns: [table.userId, table.teamKey] }),
    check(
      'user_model_teams_team_key_check',
      sql`${table.teamKey} in (${literalList(MODEL_TEAM_KEYS)})`,
    ),
  ],
);
