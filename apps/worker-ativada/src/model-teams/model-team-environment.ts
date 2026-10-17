// Copyright (c) 2026 Ada Technology. All rights reserved.
import { httpUrlSchema, nonEmptyTextSchema, z } from '@ativada/environment';

import {
  DEFAULT_ANTHROPIC_BASE_URL,
  DEFAULT_CADENCE_MINUTES,
  DEFAULT_ENTRY_TOLERANCE_PERCENT,
  DEFAULT_GEMINI_BASE_URL,
  DEFAULT_MIN_STOP_PERCENT,
  DEFAULT_OPENAI_BASE_URL,
  MAXIMUM_API_KEY_LENGTH,
  MODEL_ID_PATTERN,
  MODEL_TEAM_CADENCE_MINUTES,
  MODEL_TEAM_LIMITS,
  POSITIVE_DECIMAL_PATTERN,
  PRICE_PATTERN,
  REASONING_LEVEL,
} from './model-teams.constant.js';

type Range = { readonly minimum: number; readonly maximum: number; readonly fallback: number };

function boundedInteger(range: Range, name: string): z.ZodDefault<z.ZodCoercedNumber> {
  const expectation = `${name}: inteiro de ${range.minimum} a ${range.maximum}`;
  return z.coerce
    .number({ error: expectation })
    .int({ error: expectation })
    .min(range.minimum, { error: expectation })
    .max(range.maximum, { error: expectation })
    .default(range.fallback);
}

const apiKeySchema = nonEmptyTextSchema.max(MAXIMUM_API_KEY_LENGTH).optional();
const modelIdSchema = z
  .string()
  .regex(MODEL_ID_PATTERN, 'id do modelo: [a-z0-9.-], 3 a 80')
  .optional();
const priceSchema = z.string().regex(PRICE_PATTERN, 'preço: decimal com até 8 casas').optional();
const budgetSchema = z
  .string()
  .regex(POSITIVE_DECIMAL_PATTERN, 'teto: decimal maior que zero')
  .optional();
const levelSchema = z
  .enum([REASONING_LEVEL.LOW, REASONING_LEVEL.MEDIUM, REASONING_LEVEL.HIGH])
  .default(REASONING_LEVEL.LOW);

// Opcionais por natureza (RF04): chave ausente = provedor desligado, sem erro. A coerência (chave exige id e preço, qualquer chave
// exige os tetos) é conferida por `checkModelTeamEnvironment`.
export const modelTeamEnvironmentShape = {
  ANTHROPIC_API_KEY: apiKeySchema,
  GEMINI_API_KEY: apiKeySchema,
  OPENAI_API_KEY: apiKeySchema,
  ANTHROPIC_BASE_URL: httpUrlSchema.default(DEFAULT_ANTHROPIC_BASE_URL),
  GEMINI_BASE_URL: httpUrlSchema.default(DEFAULT_GEMINI_BASE_URL),
  OPENAI_BASE_URL: httpUrlSchema.default(DEFAULT_OPENAI_BASE_URL),
  MODEL_TEAM_LUCAS_MODEL: modelIdSchema,
  MODEL_TEAM_NINA_MODEL: modelIdSchema,
  MODEL_TEAM_OLIVIA_MODEL: modelIdSchema,
  MODEL_TEAM_LUCAS_INPUT_USD_PER_MTOK: priceSchema,
  MODEL_TEAM_LUCAS_OUTPUT_USD_PER_MTOK: priceSchema,
  MODEL_TEAM_NINA_INPUT_USD_PER_MTOK: priceSchema,
  MODEL_TEAM_NINA_OUTPUT_USD_PER_MTOK: priceSchema,
  MODEL_TEAM_OLIVIA_INPUT_USD_PER_MTOK: priceSchema,
  MODEL_TEAM_OLIVIA_OUTPUT_USD_PER_MTOK: priceSchema,
  MODEL_TEAM_NINA_THINKING_LEVEL: levelSchema,
  MODEL_TEAM_OLIVIA_REASONING_EFFORT: levelSchema,
  MODEL_TEAM_NINA_MAX_THINKING_TOKENS: boundedInteger(
    MODEL_TEAM_LIMITS.thinkingTokens,
    'MODEL_TEAM_NINA_MAX_THINKING_TOKENS',
  ),
  MODEL_TEAM_OLIVIA_MAX_THINKING_TOKENS: boundedInteger(
    MODEL_TEAM_LIMITS.thinkingTokens,
    'MODEL_TEAM_OLIVIA_MAX_THINKING_TOKENS',
  ),
  MODEL_TEAM_DAILY_BUDGET_USD: budgetSchema,
  MODEL_TEAM_MONTHLY_BUDGET_USD: budgetSchema,
  MODEL_TEAM_TIMEOUT_SECONDS: boundedInteger(
    MODEL_TEAM_LIMITS.timeoutSeconds,
    'MODEL_TEAM_TIMEOUT_SECONDS',
  ),
  MODEL_TEAM_CADENCE_MINUTES: z
    .enum(MODEL_TEAM_CADENCE_MINUTES, { error: 'MODEL_TEAM_CADENCE_MINUTES: 15 ou 60' })
    .default(DEFAULT_CADENCE_MINUTES),
  MODEL_TEAM_MAX_OUTPUT_TOKENS: boundedInteger(
    MODEL_TEAM_LIMITS.maxOutputTokens,
    'MODEL_TEAM_MAX_OUTPUT_TOKENS',
  ),
  MODEL_TEAM_CONCURRENCY: boundedInteger(MODEL_TEAM_LIMITS.concurrency, 'MODEL_TEAM_CONCURRENCY'),
  MODEL_TEAM_POLL_SECONDS: boundedInteger(MODEL_TEAM_LIMITS.pollSeconds, 'MODEL_TEAM_POLL_SECONDS'),
  MODEL_TEAM_DECISION_DEADLINE_SECONDS: boundedInteger(
    MODEL_TEAM_LIMITS.deadlineSeconds,
    'MODEL_TEAM_DECISION_DEADLINE_SECONDS',
  ),
  MODEL_TEAM_ENTRY_TOLERANCE_PERCENT: z
    .string()
    .regex(POSITIVE_DECIMAL_PATTERN, 'tolerância: decimal maior que zero')
    .default(DEFAULT_ENTRY_TOLERANCE_PERCENT),
  MODEL_TEAM_MIN_STOP_PERCENT: z
    .string()
    .regex(POSITIVE_DECIMAL_PATTERN, 'proteção mínima: decimal maior que zero')
    .default(DEFAULT_MIN_STOP_PERCENT),
};

export const MODEL_TEAM_SECRET_VARIABLES = [
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
] as const;

export const MODEL_TEAM_URL_VARIABLES = [
  'ANTHROPIC_BASE_URL',
  'GEMINI_BASE_URL',
  'OPENAI_BASE_URL',
] as const;

type TeamVariables = {
  readonly key: string;
  readonly model: string;
  readonly inputPrice: string;
  readonly outputPrice: string;
};

const TEAM_VARIABLES: readonly TeamVariables[] = [
  {
    key: 'ANTHROPIC_API_KEY',
    model: 'MODEL_TEAM_LUCAS_MODEL',
    inputPrice: 'MODEL_TEAM_LUCAS_INPUT_USD_PER_MTOK',
    outputPrice: 'MODEL_TEAM_LUCAS_OUTPUT_USD_PER_MTOK',
  },
  {
    key: 'GEMINI_API_KEY',
    model: 'MODEL_TEAM_NINA_MODEL',
    inputPrice: 'MODEL_TEAM_NINA_INPUT_USD_PER_MTOK',
    outputPrice: 'MODEL_TEAM_NINA_OUTPUT_USD_PER_MTOK',
  },
  {
    key: 'OPENAI_API_KEY',
    model: 'MODEL_TEAM_OLIVIA_MODEL',
    inputPrice: 'MODEL_TEAM_OLIVIA_INPUT_USD_PER_MTOK',
    outputPrice: 'MODEL_TEAM_OLIVIA_OUTPUT_USD_PER_MTOK',
  },
];

function isPresent(values: Readonly<Record<string, unknown>>, name: string): boolean {
  return values[name] !== undefined;
}

function addMissing(context: z.RefinementCtx, name: string, reason: string): void {
  context.addIssue({ code: 'custom', path: [name], message: reason });
}

// Fail-closed (RF04): chave presente com id ou preço ausente, ou qualquer chave sem os tetos de custo, é configuração incompleta.
// A mensagem cita só o NOME da variável, nunca o valor.
export function checkModelTeamEnvironment(
  values: Readonly<Record<string, unknown>>,
  context: z.RefinementCtx,
): void {
  const configured = TEAM_VARIABLES.filter((team) => isPresent(values, team.key));
  for (const team of configured) {
    for (const name of [team.model, team.inputPrice, team.outputPrice]) {
      if (!isPresent(values, name)) addMissing(context, name, `obrigatória com ${team.key}`);
    }
  }
  if (configured.length === 0) return;
  for (const name of ['MODEL_TEAM_DAILY_BUDGET_USD', 'MODEL_TEAM_MONTHLY_BUDGET_USD']) {
    if (!isPresent(values, name))
      addMissing(context, name, 'obrigatória com qualquer chave de modelo');
  }
  const daily = Number(values['MODEL_TEAM_DAILY_BUDGET_USD']);
  const monthly = Number(values['MODEL_TEAM_MONTHLY_BUDGET_USD']);
  if (daily > monthly) {
    addMissing(context, 'MODEL_TEAM_DAILY_BUDGET_USD', 'o teto diário não pode passar do mensal');
  }
}

export type ModelTeamEnvironment = z.infer<z.ZodObject<typeof modelTeamEnvironmentShape>>;
