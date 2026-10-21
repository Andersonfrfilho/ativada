// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from 'zod';

export const TEAM_ACTION = {
  BUY: 'buy',
  SELL: 'sell',
  HOLD: 'hold',
} as const;
export type TeamAction = (typeof TEAM_ACTION)[keyof typeof TEAM_ACTION];

export const TREND_STANCE = {
  UP: 'up',
  DOWN: 'down',
  NEUTRAL: 'neutral',
} as const;

export const RISK_LEVEL = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
} as const;

export const REPORT_TEXT_MAX_LENGTH = 160;
export const REPORT_CONFIDENCE_MAX = 100;

const textSchema = z.string().min(1).max(REPORT_TEXT_MAX_LENGTH);
const priceSchema = z
  .string()
  .regex(/^[0-9]+(\.[0-9]+)?$/)
  .nullable();

// RF07: a saída do modelo é entrada não confiável; chave a mais ou valor fora da borda reprova. Os três preços são sempre
// presentes (nulos quando não se aplicam), a forma que o esquema estrito da OpenAI exige; a coerência fica em `team-levels.ts`.
export const teamReportSchema = z.strictObject({
  trend: z.strictObject({
    stance: z.enum([TREND_STANCE.UP, TREND_STANCE.DOWN, TREND_STANCE.NEUTRAL]),
    reason: textSchema,
  }),
  risk: z.strictObject({
    level: z.enum([RISK_LEVEL.LOW, RISK_LEVEL.MEDIUM, RISK_LEVEL.HIGH]),
    reason: textSchema,
  }),
  decision: z.strictObject({
    action: z.enum([TEAM_ACTION.BUY, TEAM_ACTION.SELL, TEAM_ACTION.HOLD]),
    entryPrice: priceSchema,
    targetPrice: priceSchema,
    stopPrice: priceSchema,
    confidence: z.number().int().min(0).max(REPORT_CONFIDENCE_MAX),
    reason: textSchema,
  }),
});
export type TeamReport = z.infer<typeof teamReportSchema>;
