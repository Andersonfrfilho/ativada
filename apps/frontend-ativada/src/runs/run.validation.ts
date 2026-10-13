// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { RUN_STATUS } from './run.constant.js';
import { decimalText } from '../http/decimal.validation.js';

export const metricValueSchema = z.object({
  value: z.string().nullable(),
  reason: z.string().nullable(),
});

const drawdownSchema = z.object({ depth: z.string(), durationCandles: z.number() });

// As métricas vêm em JSON livre da API: este esquema confere só o que o painel mostra.
export const runMetricsSchema = z.object({
  initialBalance: z.string(),
  finalEquity: z.string().nullable(),
  totalReturn: metricValueSchema,
  benchmarkReturn: metricValueSchema,
  excessReturn: metricValueSchema,
  annualizedReturn: metricValueSchema,
  sharpe: metricValueSchema,
  sortino: metricValueSchema,
  winRate: metricValueSchema,
  profitFactor: metricValueSchema,
  exposure: metricValueSchema,
  maxDrawdownAtClose: drawdownSchema,
  trades: z.number(),
  wins: z.number(),
  losses: z.number(),
  feesPaid: z.string(),
  netProfit: z.string(),
});

export const overfittingSchema = z.object({
  isAlert: z.boolean(),
  reasons: z.array(z.string()),
  inSampleSharpe: metricValueSchema,
  outOfSampleSharpe: metricValueSchema,
  degradation: metricValueSchema,
  eligibleWindows: z.number(),
  totalWindows: z.number(),
});

const runParametersSchema = z.object({
  initialBalance: z.string().optional(),
  feeRate: z.string().optional(),
  slippageRate: z.string().optional(),
});

export const runSchema = z.object({
  id: z.string(),
  strategyVersionId: z.string(),
  // Texto aberto: um valor que este painel não conhece não derruba a lista inteira (a tela cai num rótulo neutro).
  kind: z.string(),
  status: z.string(),
  symbol: z.string(),
  timeframe: z.string(),
  runParameters: runParametersSchema,
  periodStart: z.number(),
  periodEnd: z.number().nullable(),
  progress: z.number(),
  metrics: z.unknown(),
  overfitting: z.unknown(),
  errorCode: z.string().nullable(),
  goalId: z.string().nullish(),
  goalOutcome: z.string().nullish(),
  stalledSince: z.number().optional(),
  // Abertura da última vela processada; nula até o primeiro passo da simulação ao vivo.
  lastCandleTime: z.number().nullish(),
  startedAt: z.string().nullish(),
  createdAt: z.string(),
});

export const runDetailSchema = runSchema.extend({
  warnings: z.array(z.object({ code: z.string(), message: z.string() })),
  queuePosition: z.object({ own: z.number(), overall: z.number() }).nullable(),
  survival: z.object({ initialBalance: z.string() }).nullable(),
  waitingForData: z.object({ since: z.number(), openTime: z.number() }).nullable(),
});

export const equityPointSchema = z.object({
  candleTime: z.number(),
  equity: decimalText,
  benchmark: decimalText,
});

export const tradeSchema = z.object({
  engineKey: z.string(),
  status: z.enum(['open', 'closed']),
  entryPrice: decimalText,
  quantity: decimalText,
  exitPrice: decimalText.optional(),
  netProfit: decimalText.optional(),
  exitReason: z.string().optional(),
  openedCandleTime: z.number(),
  closedCandleTime: z.number().optional(),
  // Campos da spec 005 (aditivos): valores pagos e recebidos vêm dos preenchimentos, em texto decimal exato.
  entryNotional: decimalText.optional(),
  exitNotional: decimalText.optional(),
  paid: decimalText.optional(),
  received: decimalText.optional(),
  fees: decimalText.optional(),
  netProfitRate: decimalText.optional(),
});

export const windowSchema = z.object({
  windowIndex: z.number(),
  testStart: z.number(),
  testEnd: z.number(),
  status: z.string(),
  eligibleCombinations: z.number(),
});

export type Run = z.infer<typeof runSchema>;
export type RunDetail = z.infer<typeof runDetailSchema>;
export type RunMetrics = z.infer<typeof runMetricsSchema>;
export type MetricValue = z.infer<typeof metricValueSchema>;
export type Overfitting = z.infer<typeof overfittingSchema>;
export type EquityPoint = z.infer<typeof equityPointSchema>;
export type Trade = z.infer<typeof tradeSchema>;
export type WalkForwardWindow = z.infer<typeof windowSchema>;

export function parseMetrics(value: unknown): RunMetrics | undefined {
  const parsed = runMetricsSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function parseOverfitting(value: unknown): Overfitting | undefined {
  const parsed = overfittingSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function isActiveRun(run: Pick<Run, 'status'>): boolean {
  return run.status === RUN_STATUS.QUEUED || run.status === RUN_STATUS.RUNNING;
}
