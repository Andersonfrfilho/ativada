// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import { RUN_STATUS, SIGNAL_ACTION } from './overview.constant.js';

export const runSchema = z.object({
  id: z.string(),
  status: z.enum(RUN_STATUS),
  symbol: z.string(),
  timeframe: z.string(),
});

export const equityPointSchema = z.object({
  candleTime: z.number(),
  equity: z.string(),
  benchmark: z.string(),
});

export const signalSchema = z.object({
  candleTime: z.number(),
  action: z.enum(SIGNAL_ACTION),
  score: z.string(),
  reason: z.string(),
});

export const candleSchema = z.object({ openTime: z.number(), close: z.string() });

export type Run = z.infer<typeof runSchema>;
export type EquityPoint = z.infer<typeof equityPointSchema>;
export type Signal = z.infer<typeof signalSchema>;
export type Candle = z.infer<typeof candleSchema>;
