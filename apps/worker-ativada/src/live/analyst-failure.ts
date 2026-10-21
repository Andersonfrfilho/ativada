// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineInputError } from '@ativada/strategy-engine';

import { ANALYST_FAILURE_CODE } from './analyst-live.constant.js';

// A leitura do par ou do histórico da simulação falhou: o texto do erro de origem nunca é guardado.
export class AnalystFailure extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

// Código estável da falha (A18). Erro de motor leva o código tipado dele junto; qualquer outro é entrada inválida.
export function describeAnalystFailure(error: unknown): string {
  if (error instanceof AnalystFailure) return error.code;
  if (error instanceof EngineInputError)
    return `${ANALYST_FAILURE_CODE.ENGINE_REFUSED}:${error.code}`;
  return ANALYST_FAILURE_CODE.INPUT_INVALID;
}
