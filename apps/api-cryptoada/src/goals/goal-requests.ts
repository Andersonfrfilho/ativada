// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';
import { GoalInputError, parseGoalSpec, type GoalSpec } from '@cryptoada/strategy-engine';

import { GOAL_REASON } from './goal.constant.js';

const TEXT_MAXIMUM = 64;
const NO_FIELD_REASON = 'at_least_one_field_required';
// Valores válidos que completam o que o PATCH não traz: só os campos presentes são conferidos e gravados.
const PROBE: GoalSpec = { targetRate: '0.01', maxLossRate: '0.01', horizonDays: 1 };

type GoalFields = {
  readonly targetRate?: string | undefined;
  readonly maxLossRate?: string | undefined;
  readonly horizonDays?: number | undefined;
};

export type CreateGoalBody = { readonly symbol: string } & GoalSpec;
export type PatchGoalBody = GoalFields & {
  readonly symbol?: string | undefined;
  readonly isActive?: boolean | undefined;
};

function pickGoalFields(body: GoalFields): GoalFields {
  return {
    ...(body.targetRate === undefined ? {} : { targetRate: body.targetRate }),
    ...(body.maxLossRate === undefined ? {} : { maxLossRate: body.maxLossRate }),
    ...(body.horizonDays === undefined ? {} : { horizonDays: body.horizonDays }),
  };
}

// Os valores são conferidos pelo esquema do MOTOR (a mesma meta que a avaliação aceita): os campos inválidos saem juntos
// (também junto com o par recusado), só com o caminho e o motivo estável, nunca com o valor recebido.
function checkFields(fields: GoalFields, context: z.RefinementCtx): void {
  try {
    parseGoalSpec({ ...PROBE, ...pickGoalFields(fields) });
  } catch (error: unknown) {
    if (!(error instanceof GoalInputError)) throw error;
    for (const path of error.issues) {
      context.addIssue({ code: 'custom', path: [path], message: GOAL_REASON.INVALID_VALUE });
    }
  }
}

// A grafia canônica ("0.0300" = "0.03"), depois de `checkFields` ter aprovado os campos presentes.
function canonicalFields(fields: GoalFields): GoalSpec {
  return parseGoalSpec({ ...PROBE, ...pickGoalFields(fields) });
}

function enabledSymbol(enabledSymbols: readonly string[]): z.ZodType<string> {
  return z
    .string()
    .max(TEXT_MAXIMUM)
    .refine((symbol) => enabledSymbols.includes(symbol), { error: GOAL_REASON.NOT_ENABLED });
}

export function createGoalSchema(enabledSymbols: readonly string[]): z.ZodType<CreateGoalBody> {
  return z
    .strictObject({
      symbol: enabledSymbol(enabledSymbols),
      targetRate: z.string().max(TEXT_MAXIMUM),
      maxLossRate: z.string().max(TEXT_MAXIMUM),
      horizonDays: z.number(),
    })
    .superRefine(checkFields)
    .transform((body): CreateGoalBody => ({ symbol: body.symbol, ...canonicalFields(body) }));
}

export function patchGoalSchema(enabledSymbols: readonly string[]): z.ZodType<PatchGoalBody> {
  return z
    .strictObject({
      symbol: enabledSymbol(enabledSymbols).optional(),
      targetRate: z.string().max(TEXT_MAXIMUM).optional(),
      maxLossRate: z.string().max(TEXT_MAXIMUM).optional(),
      horizonDays: z.number().optional(),
      isActive: z.boolean().optional(),
    })
    .superRefine((body, context) => {
      if (Object.values(body).every((value) => value === undefined)) {
        context.addIssue({ code: 'custom', path: [], message: NO_FIELD_REASON });
      }
      checkFields(body, context);
    })
    .transform((body): PatchGoalBody => {
      const spec = canonicalFields(body);
      return {
        ...body,
        ...(body.targetRate === undefined ? {} : { targetRate: spec.targetRate }),
        ...(body.maxLossRate === undefined ? {} : { maxLossRate: spec.maxLossRate }),
      };
    });
}
