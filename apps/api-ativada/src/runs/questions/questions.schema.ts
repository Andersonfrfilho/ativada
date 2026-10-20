// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import type { EnabledMarkets } from '../../markets/candles-query.schema.js';
import { epochMillisecondsSchema, resourceIdSchema } from '../../openapi/schema-primitives.js';
import {
  ANSWER_BASIS,
  QUESTION,
  QUESTION_AGENT,
  QUESTION_REASON,
  QUESTIONS_VERSION,
  type Question,
} from './questions.constant.js';

export type QuestionsQuery = { readonly symbol: string; readonly question: Question };

// O par só vale se habilitado e a pergunta só do catálogo: fora disso é 400, sem eco do que veio.
export function createQuestionsQuerySchema(
  enabled: Pick<EnabledMarkets, 'symbols'>,
): z.ZodType<QuestionsQuery> {
  return z.strictObject({
    symbol: z.string().refine((symbol) => enabled.symbols.includes(symbol), {
      error: QUESTION_REASON.NOT_ENABLED,
    }),
    question: z.enum(Object.values(QUESTION)),
  });
}

export const QUESTION_ANSWER_SCHEMA = z.strictObject({
  version: z.literal(QUESTIONS_VERSION),
  runId: resourceIdSchema,
  symbol: z.string(),
  question: z.enum(Object.values(QUESTION)),
  agent: z.enum(Object.values(QUESTION_AGENT)),
  answer: z.string(),
  basis: z.enum(Object.values(ANSWER_BASIS)),
  asOf: z
    .strictObject({ candleTime: epochMillisecondsSchema, closedAt: epochMillisecondsSchema })
    .nullable(),
  notice: z.string(),
});
