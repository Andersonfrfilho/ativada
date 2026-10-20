// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { ROOM_QUESTION } from './room-questions.constant.js';

// Espelho de `GET /v1/runs/:runId/questions` (`questions-1`, ADR 0002 "Perguntas à equipe"): a frase vem pronta do servidor e
// sai como texto; o painel não calcula nada.
export const roomQuestionAnswerSchema = z.object({
  version: z.literal('questions-1'),
  runId: z.string(),
  symbol: z.string(),
  question: z.enum(Object.values(ROOM_QUESTION)),
  agent: z.enum(['tiago', 'renata', 'vitor', 'sofia', 'alice', 'otavio']),
  answer: z.string(),
  basis: z.enum(['exact', 'indicative']),
  asOf: z.object({ candleTime: z.number(), closedAt: z.number() }).nullable(),
  notice: z.string(),
});

export type RoomQuestionAnswer = z.infer<typeof roomQuestionAnswerSchema>;
