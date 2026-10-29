// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { decimalText } from '../../../http/decimal.validation.js';
import { MODEL_TEAM_KEYS } from '../../model-teams/model-teams.constant.js';
import { TEAM_QUESTION_STATUSES } from './team-question.constant.js';

// Espelho de `GET /v1/runs/:runId/model-teams/questions` e do `202` de `POST .../:teamKey/questions` (adendo da spec 015): a
// resposta do modelo chega pronta e sai como texto (nunca HTML).
export const teamQuestionSchema = z.object({
  id: z.string(),
  teamKey: z.enum(MODEL_TEAM_KEYS),
  symbol: z.string(),
  question: z.string(),
  status: z.enum(TEAM_QUESTION_STATUSES),
  answer: z.string().nullable(),
  failureCode: z.string().nullable(),
  costUsd: decimalText,
  requestedAt: z.number(),
  decidedAt: z.number().nullable(),
});

export const teamQuestionsSchema = z.object({
  notice: z.string(),
  items: z.array(teamQuestionSchema),
});

export const questionRequestedSchema = z.object({ questionId: z.string() });

export type TeamQuestion = z.infer<typeof teamQuestionSchema>;
export type TeamQuestions = z.infer<typeof teamQuestionsSchema>;
