// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MODEL_TEAM_QUESTION_STATUS } from '@ativada/database';
import { z } from '@ativada/environment';
import {
  MODEL_TEAM_KEYS,
  TEAM_QUESTION_MAX_LENGTH,
  TEAM_QUESTION_MIN_LENGTH,
} from '@ativada/model-agents';

import type { EnabledMarkets } from '../markets/candles-query.schema.js';
import {
  decimalTextSchema,
  epochMillisecondsSchema,
  resourceIdSchema,
} from '../openapi/schema-primitives.js';
import { MODEL_TEAM_QUESTION_PAGE } from './model-team.constant.js';

const NOT_ENABLED = 'not_enabled';

export type TeamQuestionBody = { readonly symbol: string; readonly question: string };

// O par só vale se habilitado; a pergunta chega aparada, de 3 a 280 caracteres. Erro sem eco do que veio.
export function createTeamQuestionBodySchema(
  enabled: Pick<EnabledMarkets, 'symbols'>,
): z.ZodType<TeamQuestionBody> {
  return z.strictObject({
    symbol: z.string().refine((symbol) => enabled.symbols.includes(symbol), {
      error: NOT_ENABLED,
    }),
    question: z.string().trim().min(TEAM_QUESTION_MIN_LENGTH).max(TEAM_QUESTION_MAX_LENGTH),
  });
}

export const teamQuestionsQuerySchema = z.strictObject({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MODEL_TEAM_QUESTION_PAGE.MAXIMUM)
    .default(MODEL_TEAM_QUESTION_PAGE.DEFAULT),
});

export type TeamQuestionsQuery = z.infer<typeof teamQuestionsQuerySchema>;

export const QUESTION_REQUESTED_SCHEMA = z.strictObject({ questionId: resourceIdSchema });

export const TEAM_QUESTION_SCHEMA = z.strictObject({
  id: resourceIdSchema,
  teamKey: z.enum(MODEL_TEAM_KEYS),
  symbol: z.string(),
  // O texto que a própria pessoa escreveu (só ela o vê).
  question: z.string(),
  status: z.enum(Object.values(MODEL_TEAM_QUESTION_STATUS)),
  // A resposta do modelo, limpa e cortada em 600 caracteres; na oculta, a frase fixa da casa. Nula enquanto pendente ou falha.
  answer: z.string().nullable(),
  failureCode: z.string().nullable(),
  costUsd: decimalTextSchema,
  requestedAt: epochMillisecondsSchema,
  decidedAt: epochMillisecondsSchema.nullable(),
});

export const TEAM_QUESTIONS_SCHEMA = z.strictObject({
  notice: z.string(),
  items: z.array(TEAM_QUESTION_SCHEMA),
});

export type TeamQuestionsView = z.infer<typeof TEAM_QUESTIONS_SCHEMA>;
