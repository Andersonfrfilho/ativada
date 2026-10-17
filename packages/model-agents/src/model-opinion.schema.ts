// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from 'zod';

export const OPINION_POSTURE = {
  UP: 'up',
  DOWN: 'down',
  NEUTRAL: 'neutral',
} as const;
export type OpinionPosture = (typeof OPINION_POSTURE)[keyof typeof OPINION_POSTURE];

export const OPINION_REASON_MAX_LENGTH = 160;
export const OPINION_CONFIDENCE_MAX = 100;

// RF07: a saída do modelo é entrada não confiável; chave a mais ou valor fora da borda reprova.
export const modelOpinionSchema = z.strictObject({
  posture: z.enum([OPINION_POSTURE.UP, OPINION_POSTURE.DOWN, OPINION_POSTURE.NEUTRAL]),
  reason: z.string().min(1).max(OPINION_REASON_MAX_LENGTH),
  confidence: z.number().int().min(0).max(OPINION_CONFIDENCE_MAX),
});
export type ModelOpinion = z.infer<typeof modelOpinionSchema>;
