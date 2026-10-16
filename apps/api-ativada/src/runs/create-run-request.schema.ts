// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_KIND, type RunKind } from '@ativada/database';
import { hasKnownSymbolFilters } from '@ativada/market-data-crypto';
import { z } from '@ativada/environment';
import { ENGINE_TIMEFRAME, type RunSetup, type SurvivalSettings } from '@ativada/strategy-engine';

import type { EnabledMarkets } from '../markets/candles-query.schema.js';
import { epochMillisecondsSchema, resourceIdSchema } from '../openapi/schema-primitives.js';
import { analystBodySchema, resolveAnalyst, type AnalystRequest } from './run-analyst-request.js';
import {
  addIssue,
  buildSetup,
  checkedRunParametersSchema,
  type ParametersInput,
  runSetupInput,
  TEXT_MAXIMUM,
  type RefinementContext,
} from './create-run-setup.js';
import { resolveSurvival } from './run-survival-request.js';
import { RUN_FIELD, RUN_REASON } from './runs.constant.js';

const MONTHS_MAXIMUM = 120;
const MIN_TRADES_MAXIMUM = 10_000;

// Só os campos que o usuário ajusta do piso e da meta de dobro; os limites e a grafia são do esquema do MOTOR.
const survivalBodySchema = z.strictObject({
  floorRate: z.string().max(TEXT_MAXIMUM).optional(),
  doubleRate: z.string().max(TEXT_MAXIMUM).optional(),
});

const monthsSchema = z.int().min(1).max(MONTHS_MAXIMUM);

export const windowsBodySchema = z.strictObject({
  trainMonths: monthsSchema.optional(),
  testMonths: monthsSchema.optional(),
  stepMonths: monthsSchema.optional(),
  minTradesPerWindow: z.int().min(1).max(MIN_TRADES_MAXIMUM).optional(),
});

export type WalkForwardBody = {
  readonly grid: unknown;
  readonly trainMonths?: number | undefined;
  readonly testMonths?: number | undefined;
  readonly stepMonths?: number | undefined;
  readonly minTradesPerWindow?: number | undefined;
};

export type CreateRunBody = {
  readonly strategyVersionId: string;
  readonly kind: RunKind;
  readonly setup: RunSetup;
  // Ausentes na simulação ao vivo: ela começa no candle corrente e não tem fim.
  readonly periodStart: number | undefined;
  readonly periodEnd: number | undefined;
  readonly walkForward: WalkForwardBody | undefined;
  // Piso e meta de dobro da simulação ao vivo (RF09); ausente vale o padrão do RF09.
  readonly survival: SurvivalSettings | undefined;
  // A meta do dono a que a simulação ao vivo fica atrelada (a existência e o dono são conferidos ao criar).
  readonly goalId: string | undefined;
  // O analista de risco em sombra (spec 007); só na simulação ao vivo de 15 min.
  readonly analyst: AnalystRequest | undefined;
};

type ParsedBody = {
  readonly strategyVersionId: string;
  readonly kind: RunKind;
  readonly symbol: string;
  readonly timeframe: string;
  readonly periodStart?: number | undefined;
  readonly periodEnd?: number | undefined;
  readonly runParameters?: ParametersInput;
  readonly grid?: unknown;
  readonly windows?: z.infer<typeof windowsBodySchema> | undefined;
  readonly survival?: z.infer<typeof survivalBodySchema> | undefined;
  readonly goalId?: string | undefined;
  readonly analyst?: z.infer<typeof analystBodySchema> | undefined;
};

function checkPeriod(body: ParsedBody, context: RefinementContext): void {
  const isLive = body.kind === RUN_KIND.LIVE_PAPER;
  const fields = [
    [RUN_FIELD.PERIOD_START, body.periodStart],
    [RUN_FIELD.PERIOD_END, body.periodEnd],
  ] as const;
  for (const [field, value] of fields) {
    if (isLive && value !== undefined) addIssue(context, [field], RUN_REASON.NOT_ALLOWED_FOR_KIND);
    if (!isLive && value === undefined) addIssue(context, [field], RUN_REASON.REQUIRED);
  }
  const { periodStart, periodEnd } = body;
  if (periodStart !== undefined && periodEnd !== undefined && periodEnd <= periodStart) {
    addIssue(context, [RUN_FIELD.PERIOD_END], RUN_REASON.PERIOD_END_MUST_BE_AFTER_START);
  }
}

function checkGoal(body: ParsedBody, context: RefinementContext): void {
  if (body.goalId !== undefined && body.kind !== RUN_KIND.LIVE_PAPER) {
    addIssue(context, [RUN_FIELD.GOAL_ID], RUN_REASON.NOT_ALLOWED_FOR_KIND);
  }
}

function checkKindFields(body: ParsedBody, context: RefinementContext): void {
  const isWalkForward = body.kind === RUN_KIND.WALK_FORWARD;
  if (isWalkForward && body.grid === undefined) {
    addIssue(context, [RUN_FIELD.GRID], RUN_REASON.GRID_REQUIRED);
  }
  if (!isWalkForward && body.grid !== undefined) {
    addIssue(context, [RUN_FIELD.GRID], RUN_REASON.NOT_ALLOWED_FOR_KIND);
  }
  if (!isWalkForward && body.windows !== undefined) {
    addIssue(context, [RUN_FIELD.WINDOWS], RUN_REASON.NOT_ALLOWED_FOR_KIND);
  }
  checkPeriod(body, context);
  checkGoal(body, context);
}

function toWalkForward(body: ParsedBody): WalkForwardBody | undefined {
  if (body.kind !== RUN_KIND.WALK_FORWARD) return undefined;
  return { grid: body.grid, ...body.windows };
}

function enabledOnly(values: readonly string[]): (value: string) => boolean {
  return (value: string): boolean => values.includes(value);
}

function enabledWithFilters(values: readonly string[]): (value: string) => boolean {
  return (value: string): boolean => values.includes(value) && hasKnownSymbolFilters(value);
}

function toCreateRunBody(body: ParsedBody, context: RefinementContext): CreateRunBody {
  checkKindFields(body, context);
  const survival = resolveSurvival(body, context);
  const analyst = resolveAnalyst(body, context);
  const setup = buildSetup(runSetupInput(body.symbol, body.timeframe, body.runParameters), context);
  if (setup === undefined) return z.NEVER;
  return {
    strategyVersionId: body.strategyVersionId,
    kind: body.kind,
    setup,
    periodStart: body.periodStart,
    periodEnd: body.periodEnd,
    walkForward: toWalkForward(body),
    survival,
    goalId: body.goalId,
    analyst,
  };
}

export function createRunRequestSchema(enabled: EnabledMarkets): z.ZodType<CreateRunBody> {
  return z
    .strictObject({
      strategyVersionId: resourceIdSchema,
      kind: z.enum(RUN_KIND),
      symbol: z
        .string()
        .refine(enabledWithFilters(enabled.symbols), { error: RUN_REASON.NOT_ENABLED }),
      timeframe: z
        .enum(ENGINE_TIMEFRAME)
        .refine(enabledOnly(enabled.timeframes), { error: RUN_REASON.NOT_ENABLED }),
      periodStart: epochMillisecondsSchema.optional(),
      periodEnd: epochMillisecondsSchema.optional(),
      runParameters: checkedRunParametersSchema.optional(),
      grid: z.unknown().optional(),
      windows: windowsBodySchema.optional(),
      survival: survivalBodySchema.optional(),
      goalId: resourceIdSchema.optional(),
      analyst: analystBodySchema.optional(),
    })
    .transform(toCreateRunBody);
}
