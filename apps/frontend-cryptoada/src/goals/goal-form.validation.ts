// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { FormProblem } from '../forms/ProblemList.component.js';
import { ApiError } from '../http/api.error.js';
import {
  GOAL_ERROR_TEXT,
  GOAL_FIELD_LABEL,
  GOAL_REASON_TEXT,
  MAXIMUM_HORIZON_DAYS,
} from './goal.constant.js';
import { percentToFraction } from './percent.js';

export type GoalFormValues = {
  readonly symbol: string;
  readonly targetPercent: string;
  readonly horizonDays: string;
  readonly maxLossPercent: string;
};

const INTEGER_PATTERN = /^\d+$/;

function percentProblem(field: string, text: string): FormProblem | undefined {
  const fraction = percentToFraction(text);
  if (fraction !== undefined && Number(fraction) > 0) return undefined;
  return { field, message: 'informe uma porcentagem maior que zero (ex.: 3 ou 2.5).' };
}

export function validateGoalForm(values: GoalFormValues): FormProblem[] {
  const horizon = values.horizonDays.trim();
  const isHorizonValid =
    INTEGER_PATTERN.test(horizon) &&
    Number(horizon) >= 1 &&
    Number(horizon) <= MAXIMUM_HORIZON_DAYS;
  const problems: (FormProblem | undefined)[] = [
    values.symbol === '' ? { field: 'Par', message: 'escolha um par.' } : undefined,
    percentProblem('Retorno alvo', values.targetPercent),
    isHorizonValid
      ? undefined
      : { field: 'Prazo', message: `informe de 1 a ${MAXIMUM_HORIZON_DAYS} dias.` },
    percentProblem('Perda máxima', values.maxLossPercent),
  ];
  return problems.filter((problem): problem is FormProblem => problem !== undefined);
}

// Só depois de `validateGoalForm` aprovar: a conversão de porcentagem para fração é exata.
export function buildGoalRequest(values: GoalFormValues): Record<string, unknown> {
  return {
    symbol: values.symbol,
    targetRate: percentToFraction(values.targetPercent),
    maxLossRate: percentToFraction(values.maxLossPercent),
    horizonDays: Number(values.horizonDays.trim()),
  };
}

export function problemsFromGoalError(error: Error | null): FormProblem[] {
  if (error === null) return [];
  if (!(error instanceof ApiError)) {
    return [{ field: 'Pedido', message: 'não foi possível enviar. Tente novamente.' }];
  }
  const known = GOAL_ERROR_TEXT[error.code];
  if (known !== undefined) return [{ field: 'Meta', message: known }];
  if (error.details.length === 0) return [{ field: 'Pedido', message: error.message }];
  return error.details.map((detail) => ({
    field: GOAL_FIELD_LABEL[detail.field] ?? detail.field,
    message: GOAL_REASON_TEXT[detail.reason] ?? detail.reason,
  }));
}

export function messageFromGoalError(error: Error | null): string | undefined {
  if (error === null) return undefined;
  if (error instanceof ApiError) return GOAL_ERROR_TEXT[error.code] ?? error.message;
  return 'Não foi possível concluir. Tente novamente.';
}
