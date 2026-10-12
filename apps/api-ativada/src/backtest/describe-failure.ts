// Copyright (c) 2026 Ada Technology. All rights reserved.
import { PositionUntrackedError } from '@ativada/run-recording';
import {
  EngineInputError,
  EngineStateError,
  IndicatorError,
  RunParametersError,
  StrategyConfigError,
  StrategyEngineError,
} from '@ativada/strategy-engine';

import { BACKTEST_ERROR_CODE, type BacktestErrorCode } from './backtest.constant.js';
import { BacktestError } from './backtest.error.js';

export type BacktestFailure = {
  readonly errorCode: BacktestErrorCode;
  readonly message: string;
};

// O código e a mensagem que saem daqui são os únicos que chegam ao banco, ao log e à thread principal. A mensagem
// do erro original NUNCA passa adiante: erro de driver ou de rede pode trazer texto de consulta, URL ou segredo.
export function describeFailure(error: unknown): BacktestFailure {
  if (error instanceof BacktestError) return { errorCode: error.code, message: error.message };
  if (error instanceof PositionUntrackedError) {
    return { errorCode: BACKTEST_ERROR_CODE.POSITION_UNTRACKED, message: error.message };
  }
  if (error instanceof EngineInputError) {
    return {
      errorCode: BACKTEST_ERROR_CODE.ENGINE_REJECTED_INPUT,
      message: `O motor recusou a entrada (${error.code}).`,
    };
  }
  if (error instanceof EngineStateError) {
    return {
      errorCode: BACKTEST_ERROR_CODE.ENGINE_STATE_UNUSABLE,
      message: `O estado do motor não é utilizável (${error.code}).`,
    };
  }
  if (error instanceof StrategyConfigError || error instanceof RunParametersError) {
    return {
      errorCode: BACKTEST_ERROR_CODE.INVALID_RUN_DATA,
      message: 'A configuração ou os parâmetros da execução não são válidos.',
    };
  }
  if (error instanceof IndicatorError || error instanceof StrategyEngineError) {
    return {
      errorCode: BACKTEST_ERROR_CODE.ENGINE_FAILED,
      message: `O motor falhou (${error.name}).`,
    };
  }
  const name = error instanceof Error ? error.name : typeof error;
  return {
    errorCode: BACKTEST_ERROR_CODE.BACKTEST_UNEXPECTED,
    message: `Falha inesperada (${name}).`,
  };
}
