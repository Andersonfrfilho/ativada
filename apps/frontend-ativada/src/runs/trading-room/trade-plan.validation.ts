// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { decimalText } from '../../http/decimal.validation.js';

// Espelho de `GET /v1/runs/:runId/trade-plan` (`trade-plan-1`, ADR 0002 "Plano de operação ao vivo"): valor fora do
// contrato reprova e nada é desenhado. O painel só formata estes textos decimais; nenhuma conta de dinheiro aqui.
const instant = z.number();
const distanceSchema = z.object({ value: decimalText, rate: decimalText });
const resultSchema = z.object({ net: decimalText, rate: decimalText });
const pricePoint = { price: decimalText, distance: distanceSchema };

const protectiveSchema = z.object({
  ...pricePoint,
  exitPrice: decimalText,
  fromEntryRate: decimalText,
  result: resultSchema.nullable(),
});

const sizingSchema = z.object({
  riskAmount: decimalText,
  quantity: decimalText,
  notional: decimalText,
  entryCost: decimalText,
  constraint: z.string(),
});

const decidedCandle = { candleTime: instant, closedAt: instant, currentPrice: decimalText };

const planSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('awaiting_entry'),
    ...decidedCandle,
    orderType: z.enum(['market', 'limit']),
    nextOpenEstimate: decimalText.nullable(),
    entry: z.object(pricePoint),
    target: protectiveSchema,
    stop: protectiveSchema,
    sizing: sizingSchema,
    message: z.string(),
  }),
  z.object({
    status: z.literal('holding'),
    ...decidedCandle,
    entryPrice: decimalText,
    quantity: decimalText,
    entryCost: decimalText,
    openedCandleTime: instant,
    exit: z.object({ ...pricePoint, result: resultSchema }),
    target: protectiveSchema,
    stop: protectiveSchema,
    message: z.string(),
  }),
  z.object({
    status: z.literal('unavailable'),
    reason: z.enum([
      'not_running',
      'stalled',
      'waiting_for_data',
      'no_candle',
      'no_atr',
      'invalid_stop',
    ]),
    message: z.string(),
  }),
]);

const teamHead = {
  teamKey: z.string(),
  displayName: z.string(),
  wallet: z
    .object({ current: decimalText, result: decimalText, resultRate: decimalText })
    .nullable(),
};

const teamSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('available'),
    ...teamHead,
    reportId: z.string(),
    candleTime: instant,
    confidence: z.number().int().nullable(),
    entry: z.object({ ...pricePoint, suggestedPrice: decimalText }),
    target: protectiveSchema,
    stop: protectiveSchema,
    sizing: sizingSchema,
    message: z.string(),
  }),
  z.object({
    status: z.literal('unavailable'),
    ...teamHead,
    reason: z.enum(['no_report', 'no_entry', 'invalid_levels']),
    reportId: z.string().nullable(),
    candleTime: instant.nullable(),
    action: z.enum(['buy', 'sell', 'hold']).nullable(),
    confidence: z.number().int().nullable(),
    message: z.string(),
  }),
]);

export const tradePlanSchema = z.object({
  version: z.string(),
  runId: z.string(),
  symbol: z.string(),
  timeframe: z.string(),
  notice: z.string(),
  plan: planSchema,
  teams: z.array(teamSchema),
});

export type TradePlan = z.infer<typeof tradePlanSchema>;
export type StrategyPlan = TradePlan['plan'];
export type TeamPlan = TradePlan['teams'][number];
export type ProtectiveLevel = z.infer<typeof protectiveSchema>;
