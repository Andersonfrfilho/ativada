// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';
import { MODEL_TEAM_KEYS, SIGNAL_SOURCE_KIND } from '@ativada/model-agents';

import { decimalTextSchema, resourceIdSchema } from '../openapi/schema-primitives.js';
import {
  RECOMMENDATION_SCHEMA,
  SCOREBOARD_SCHEMA,
  TEAM_VIEW_SCHEMA,
} from './model-team-view.schema.js';
import { MODEL_TEAM_MAX_TRACKED_OPINIONS } from './model-team.constant.js';

const SEPARATOR = ',';

// Os pedidos avulsos que a tela acompanha: ids do `202`, separados por vírgula, no máximo seis. Id malformado é 400 (sem eco).
export const runModelTeamsQuerySchema = z.strictObject({
  opinionIds: z
    .string()
    .max(MODEL_TEAM_MAX_TRACKED_OPINIONS * 40)
    .transform((text) => text.split(SEPARATOR))
    .pipe(z.array(resourceIdSchema).min(1).max(MODEL_TEAM_MAX_TRACKED_OPINIONS))
    .optional(),
});

export type RunModelTeamsQuery = z.infer<typeof runModelTeamsQuerySchema>;

const SIGNAL_SOURCE_VIEW_SCHEMA = z.strictObject({
  kind: z.literal(SIGNAL_SOURCE_KIND.MODEL_TEAM),
  team: z.enum(MODEL_TEAM_KEYS),
});

const TEAM_STATE_SCHEMA = z.strictObject({
  team: TEAM_VIEW_SCHEMA,
  // As últimas recomendações AGENDADAS (decididas, falhas e puladas), da mais nova.
  recent: z.array(RECOMMENDATION_SCHEMA),
  // Só os pedidos avulsos pedidos por `opinionIds`: nunca o de outro usuário.
  onDemand: z.array(RECOMMENDATION_SCHEMA),
  scoreboard: SCOREBOARD_SCHEMA,
  cost: z.strictObject({ todayUsd: decimalTextSchema, monthUsd: decimalTextSchema }),
  failures: z.strictObject({
    hours: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
});

export const RUN_MODEL_TEAMS_SCHEMA = z.strictObject({
  symbol: z.string(),
  // Preenchido na execução de equipe (◆): de qual equipe ela segue as decisões.
  signalSource: SIGNAL_SOURCE_VIEW_SCHEMA.nullable(),
  notice: z.string(),
  costNotice: z.string(),
  comparisonNotice: z.string(),
  teams: z.array(TEAM_STATE_SCHEMA),
  totalCost: z.strictObject({ todayUsd: decimalTextSchema, monthUsd: decimalTextSchema }),
});

export type RunModelTeamsView = z.infer<typeof RUN_MODEL_TEAMS_SCHEMA>;
export type TeamStateView = z.infer<typeof TEAM_STATE_SCHEMA>;
