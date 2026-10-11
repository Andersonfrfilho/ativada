// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

import { normalizeDecimalInput } from '../forms/decimal-input.js';
import { ApiError } from '../http/api.error.js';
import type { FormProblem } from '../forms/ProblemList.component.js';

export type BacktestFormValues = {
  readonly strategyId: string;
  readonly versionId: string;
  readonly symbol: string;
  readonly timeframe: string;
  readonly start: string;
  readonly end: string;
  readonly initialBalance: string;
  readonly feeRate: string;
  readonly slippageRate: string;
};

export const DEFAULT_INITIAL_BALANCE = '10000';
export const DEFAULT_FEE_RATE = '0.001';
export const DEFAULT_SLIPPAGE_RATE = '0.0005';
export const DEFAULT_TIMEFRAME = '1h';
const DEFAULT_WINDOW_DAYS = 180;
const MILLISECONDS_PER_DAY = 86_400_000;
const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const FIELD_LABEL: Readonly<Record<string, string>> = {
  strategyVersionId: 'Versão',
  symbol: 'Par',
  timeframe: 'Timeframe',
  periodStart: 'Início',
  periodEnd: 'Fim',
  'runParameters.initialBalance': 'Capital inicial',
  'runParameters.feeRate': 'Taxa por ordem',
  'runParameters.slippageRate': 'Slippage',
};

const REASON_TEXT: Readonly<Record<string, string>> = {
  invalid_value: 'valor inválido',
  not_enabled: 'não habilitado neste ambiente',
  must_be_after_period_start: 'deve ser depois do início',
  required: 'obrigatório',
};

const QUEUE_FULL_CODE = 'RUN_QUEUE_FULL';
const QUEUE_FULL_TEXT = 'Sua fila de execuções está cheia. Espere uma terminar ou cancele uma.';

function toDateText(epochMilliseconds: number): string {
  return new Date(epochMilliseconds).toISOString().slice(0, 10);
}

// Padrão: os últimos 180 dias fechados (até ontem, em UTC).
export function defaultFormValues(now: number, symbol: string): BacktestFormValues {
  const end = Math.floor(now / MILLISECONDS_PER_DAY) * MILLISECONDS_PER_DAY - MILLISECONDS_PER_DAY;
  return {
    strategyId: '',
    versionId: '',
    symbol,
    timeframe: DEFAULT_TIMEFRAME,
    start: toDateText(end - DEFAULT_WINDOW_DAYS * MILLISECONDS_PER_DAY),
    end: toDateText(end),
    initialBalance: DEFAULT_INITIAL_BALANCE,
    feeRate: DEFAULT_FEE_RATE,
    slippageRate: DEFAULT_SLIPPAGE_RATE,
  };
}

function toUtcMilliseconds(dateText: string): number {
  return Date.parse(`${dateText}T00:00:00.000Z`);
}

function rateProblem(field: string, value: string): FormProblem | undefined {
  const isValid = DECIMAL_PATTERN.test(value) && Number(value) < 1;
  return isValid ? undefined : { field, message: 'informe uma fração entre 0 e 1 (ex.: 0.001).' };
}

export function validateBacktestForm(values: BacktestFormValues): FormProblem[] {
  const problems: (FormProblem | undefined)[] = [];
  if (values.versionId === '')
    problems.push({ field: 'Versão', message: 'escolha uma estratégia.' });
  const balance = normalizeDecimalInput(values.initialBalance);
  const hasBalance = DECIMAL_PATTERN.test(balance) && Number(balance) > 0;
  if (!hasBalance) {
    problems.push({
      field: 'Capital inicial',
      message: 'informe um número maior que zero (ex.: 10000).',
    });
  }
  problems.push(rateProblem('Taxa por ordem', normalizeDecimalInput(values.feeRate)));
  problems.push(rateProblem('Slippage', normalizeDecimalInput(values.slippageRate)));
  const hasDates = DATE_PATTERN.test(values.start) && DATE_PATTERN.test(values.end);
  if (!hasDates) problems.push({ field: 'Início', message: 'informe as duas datas.' });
  else if (toUtcMilliseconds(values.end) <= toUtcMilliseconds(values.start)) {
    problems.push({ field: 'Fim', message: 'deve ser depois do início.' });
  }
  return problems.filter((problem): problem is FormProblem => problem !== undefined);
}

export function buildBacktestRequest(values: BacktestFormValues): Record<string, unknown> {
  return {
    strategyVersionId: values.versionId,
    kind: 'backtest',
    symbol: values.symbol,
    timeframe: values.timeframe,
    periodStart: toUtcMilliseconds(values.start),
    periodEnd: toUtcMilliseconds(values.end),
    runParameters: {
      initialBalance: normalizeDecimalInput(values.initialBalance),
      feeRate: normalizeDecimalInput(values.feeRate),
      slippageRate: normalizeDecimalInput(values.slippageRate),
    },
  };
}

// O que a API recusou, campo a campo, com o nome do campo na tela e o motivo em português.
export function problemsFromApiError(error: Error | null): FormProblem[] {
  if (!(error instanceof ApiError))
    return error === null
      ? []
      : [{ field: 'Pedido', message: 'não foi possível enviar. Tente novamente.' }];
  if (error.code === QUEUE_FULL_CODE) return [{ field: 'Fila', message: QUEUE_FULL_TEXT }];
  if (error.details.length === 0) return [{ field: 'Pedido', message: error.message }];
  return error.details.map((detail) => ({
    field: FIELD_LABEL[detail.field] ?? detail.field,
    message: REASON_TEXT[detail.reason] ?? detail.reason,
  }));
}

const riskSchema = z.object({ risk: z.object({ riskPerTrade: z.string() }) });

export function readRiskPerTrade(config: Record<string, unknown>): number | undefined {
  const parsed = riskSchema.safeParse(config);
  return parsed.success ? Number(parsed.data.risk.riskPerTrade) : undefined;
}
