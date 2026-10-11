// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import { SIGNAL_ACTION } from './overview.constant.js';
import { decimalText } from '../http/decimal.validation.js';

export const runSchema = z.object({
  id: z.string(),
  status: z.string(),
  symbol: z.string(),
  timeframe: z.string(),
  periodStart: z.number().optional(),
  goalId: z.string().nullish(),
  goalOutcome: z.string().nullish(),
});

export const equityPointSchema = z.object({
  candleTime: z.number(),
  equity: decimalText,
  benchmark: decimalText,
});

export const signalSchema = z.object({
  candleTime: z.number(),
  action: z.enum(SIGNAL_ACTION),
  score: decimalText,
  reason: z.string(),
});

export const candleSchema = z.object({ openTime: z.number(), close: decimalText });

export type Run = z.infer<typeof runSchema>;
export type EquityPoint = z.infer<typeof equityPointSchema>;
export type Signal = z.infer<typeof signalSchema>;
export type Candle = z.infer<typeof candleSchema>;
