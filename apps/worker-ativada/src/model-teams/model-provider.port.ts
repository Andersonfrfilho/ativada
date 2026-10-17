// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  MODEL_CALL_STATUS,
  teamReportSchema,
  type ModelCallMeasure,
  type ModelCallResult,
  type ModelTokenUsage,
  type RequestTeamReportParams,
} from '@ativada/model-agents';

import { classifyFailure, isSuccessStatus, type HttpOutcome } from './provider-http.js';

// RF01: a porta única. Todo modelo é chamado por ela; o resultado leva só código e medida, nunca texto de erro.
export type ModelProviderPort = {
  readonly requestTeamReport: (params: RequestTeamReportParams) => Promise<ModelCallResult>;
};

// O que cada adaptador extrai de uma resposta 2xx: o candidato a relatório (ainda não validado), ou recusa, ou saída inválida.
export type ParsedPayload =
  | { readonly kind: 'candidate'; readonly candidate: unknown; readonly usage: ModelTokenUsage }
  | { readonly kind: 'refused'; readonly usage: ModelTokenUsage }
  | { readonly kind: 'invalid'; readonly usage: ModelTokenUsage };

export const NO_USAGE: ModelTokenUsage = { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 };

export type CompleteCallParams = {
  readonly outcome: HttpOutcome;
  readonly latencyMilliseconds: number;
  readonly parse: (body: unknown) => ParsedPayload;
};

function measureOf(latencyMilliseconds: number, usage?: ModelTokenUsage): ModelCallMeasure {
  return { latencyMilliseconds, ...usage };
}

// Fecha a chamada de qualquer adaptador: classifica o HTTP, extrai e valida a saída pelo Zod da casa (entrada não confiável).
export function completeCall(params: CompleteCallParams): ModelCallResult {
  const { outcome, latencyMilliseconds } = params;
  const failure = classifyFailure(outcome, measureOf(latencyMilliseconds));
  if (failure !== undefined) return failure;
  if (outcome.kind !== 'response' || !isSuccessStatus(outcome.status)) {
    return { status: MODEL_CALL_STATUS.UNAVAILABLE, measure: measureOf(latencyMilliseconds) };
  }
  const parsed = params.parse(outcome.body);
  const measure = measureOf(latencyMilliseconds, parsed.usage);
  if (parsed.kind === 'refused') return { status: MODEL_CALL_STATUS.REFUSED, measure };
  if (parsed.kind === 'invalid') return { status: MODEL_CALL_STATUS.INVALID_OUTPUT, measure };
  const report = teamReportSchema.safeParse(parsed.candidate);
  if (!report.success) return { status: MODEL_CALL_STATUS.INVALID_OUTPUT, measure };
  return {
    status: MODEL_CALL_STATUS.OK,
    report: report.data,
    usage: parsed.usage,
    latencyMilliseconds,
  };
}

export function parseJsonText(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return undefined;
  }
}
