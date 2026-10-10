// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EngineInputError,
  EngineStateError,
  IndicatorError,
  RunParametersError,
  StrategyConfigError,
  StrategyEngineError,
  WalkForwardError,
} from '@cryptoada/strategy-engine';

import { WALK_FORWARD_ERROR_CODE, type WalkForwardRunErrorCode } from './walk-forward.constant.js';
import { WalkForwardRunError } from './walk-forward.error.js';

export type WalkForwardFailure = {
  readonly errorCode: WalkForwardRunErrorCode;
  readonly message: string;
};

const DOMAIN_CODES: ReadonlyMap<string, WalkForwardRunErrorCode> = new Map([
  ['INVALID_GRID', WALK_FORWARD_ERROR_CODE.INVALID_GRID],
  ['GRID_TOO_LARGE', WALK_FORWARD_ERROR_CODE.GRID_TOO_LARGE],
  ['NO_VALID_COMBINATIONS', WALK_FORWARD_ERROR_CODE.NO_VALID_COMBINATIONS],
  ['INVALID_WINDOW_CONFIG', WALK_FORWARD_ERROR_CODE.INVALID_WINDOW_CONFIG],
  ['PERIOD_TOO_SHORT', WALK_FORWARD_ERROR_CODE.PERIOD_TOO_SHORT],
]);

function describeDetails(error: WalkForwardError): string {
  const entries = Object.entries(error.details).map(([key, value]) => `${key}=${value}`);
  return entries.length === 0 ? '' : ` (${entries.join(', ')})`;
}

// O código e a mensagem que saem daqui são os únicos que chegam ao banco, ao log e à thread principal. A mensagem
// do erro original NUNCA passa adiante (erro de driver traz consulta, URL ou segredo); a do domínio é escrita por
// nós e só carrega contagens.
export function describeFailure(error: unknown): WalkForwardFailure {
  if (error instanceof WalkForwardRunError)
    return { errorCode: error.code, message: error.message };
  if (error instanceof WalkForwardError) {
    const errorCode = DOMAIN_CODES.get(error.code) ?? WALK_FORWARD_ERROR_CODE.INVALID_GRID;
    return { errorCode, message: `${error.message}${describeDetails(error)}` };
  }
  if (error instanceof EngineInputError) {
    return {
      errorCode: WALK_FORWARD_ERROR_CODE.ENGINE_REJECTED_INPUT,
      message: `O motor recusou a entrada (${error.code}).`,
    };
  }
  if (error instanceof StrategyConfigError || error instanceof RunParametersError) {
    return {
      errorCode: WALK_FORWARD_ERROR_CODE.INVALID_RUN_DATA,
      message: 'A configuração ou os parâmetros da execução não são válidos.',
    };
  }
  if (
    error instanceof EngineStateError ||
    error instanceof IndicatorError ||
    error instanceof StrategyEngineError
  ) {
    return {
      errorCode: WALK_FORWARD_ERROR_CODE.ENGINE_FAILED,
      message: `O motor falhou (${error.name}).`,
    };
  }
  const name = error instanceof Error ? error.name : typeof error;
  return {
    errorCode: WALK_FORWARD_ERROR_CODE.WALK_FORWARD_UNEXPECTED,
    message: `Falha inesperada (${name}).`,
  };
}
