// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  MODEL_CALL_STATUS,
  type FreeTextCallResult,
  type ModelCallMeasure,
  type ModelTokenUsage,
} from '@ativada/model-agents';

import { classifyFailure, isSuccessStatus, type HttpOutcome } from './provider-http.js';

// O que cada adaptador extrai de uma resposta 2xx em modo texto: o texto, ou recusa, ou saída inválida (truncada, vazia).
export type ParsedText =
  | { readonly kind: 'text'; readonly text: string; readonly usage: ModelTokenUsage }
  | { readonly kind: 'refused'; readonly usage: ModelTokenUsage }
  | { readonly kind: 'invalid'; readonly usage: ModelTokenUsage };

export type CompleteFreeTextParams = {
  readonly outcome: HttpOutcome;
  readonly latencyMilliseconds: number;
  readonly parse: (body: unknown) => ParsedText;
};

function measureOf(latencyMilliseconds: number, usage?: ModelTokenUsage): ModelCallMeasure {
  return { latencyMilliseconds, ...usage };
}

// Fecha a chamada em modo texto de qualquer adaptador, com a MESMA classificação de HTTP do relatório (só códigos).
export function completeFreeText(params: CompleteFreeTextParams): FreeTextCallResult {
  const { outcome, latencyMilliseconds } = params;
  const failure = classifyFailure(outcome, measureOf(latencyMilliseconds));
  if (failure !== undefined && failure.status !== MODEL_CALL_STATUS.OK) return failure;
  if (outcome.kind !== 'response' || !isSuccessStatus(outcome.status)) {
    return { status: MODEL_CALL_STATUS.UNAVAILABLE, measure: measureOf(latencyMilliseconds) };
  }
  const parsed = params.parse(outcome.body);
  const measure = measureOf(latencyMilliseconds, parsed.usage);
  if (parsed.kind === 'refused') return { status: MODEL_CALL_STATUS.REFUSED, measure };
  if (parsed.kind === 'invalid' || parsed.text.trim() === '') {
    return { status: MODEL_CALL_STATUS.INVALID_OUTPUT, measure };
  }
  return {
    status: MODEL_CALL_STATUS.OK,
    text: parsed.text,
    usage: parsed.usage,
    latencyMilliseconds,
  };
}
