// Copyright (c) 2026 Ada Technology. All rights reserved.
import { isForeignKeyViolation, readPostgresErrorCode } from '@ativada/database';
import { PositionUntrackedError } from '@ativada/run-recording';
import {
  EngineInputError,
  EngineStateError,
  IndicatorError,
  RunParametersError,
  StrategyConfigError,
  StrategyEngineError,
} from '@ativada/strategy-engine';

import { LIVE_ERROR_CODE, type LiveErrorCode } from './live.constant.js';
import { LiveRunError } from './live-run.error.js';

// Classes de SQLSTATE que descrevem um defeito da consulta ou do dado (22 dado, 23 integridade, 42 sintaxe): repetir não
// adianta, então o erro vira falha tipada. As demais (08 conexão, 40 deadlock, 53 recursos, 57 operador) passam.
const DETERMINISTIC_SQLSTATE_CLASSES: readonly string[] = ['22', '23', '42'];
const SQLSTATE_CLASS_LENGTH = 2;
const TRANSIENT_ERROR_CODES: readonly string[] = [
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
];
const TRANSIENT_ERROR_PREFIXES: readonly string[] = ['ERR_POSTGRES', 'ERR_SQL'];

function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const code: unknown = Object.getOwnPropertyDescriptor(error, 'code')?.value;
  return typeof code === 'string' ? code : undefined;
}

// A execução não falha por causa do banco ou da rede: o checkpoint garante que a próxima ronda retoma de onde parou.
export function isTransientFailure(error: unknown): boolean {
  const sqlState = readPostgresErrorCode(error);
  if (sqlState !== undefined) {
    return !DETERMINISTIC_SQLSTATE_CLASSES.includes(sqlState.slice(0, SQLSTATE_CLASS_LENGTH));
  }
  const code = readErrorCode(error);
  if (code === undefined) return false;
  return (
    TRANSIENT_ERROR_CODES.includes(code) ||
    TRANSIENT_ERROR_PREFIXES.some((prefix) => code.startsWith(prefix))
  );
}

// A exclusão da conta apagou a execução (ou o dono) no meio do passo: a execução acabou, o que não é erro (ADR 0001 §k).
export function isEndedByAccountDeletion(error: unknown): boolean {
  return isForeignKeyViolation(error);
}

// Só o CÓDIGO estável chega ao banco: o texto do erro original NUNCA passa adiante, porque erro de driver ou de rede pode
// trazer consulta, URL ou segredo. No log vai também o nome da classe do erro (nunca a mensagem).
export function describeLiveFailure(error: unknown): LiveErrorCode {
  if (error instanceof LiveRunError) return error.code;
  if (error instanceof EngineInputError) return LIVE_ERROR_CODE.ENGINE_REJECTED_INPUT;
  if (error instanceof EngineStateError) return LIVE_ERROR_CODE.ENGINE_STATE_UNUSABLE;
  if (error instanceof StrategyConfigError || error instanceof RunParametersError) {
    return LIVE_ERROR_CODE.INVALID_RUN_DATA;
  }
  if (
    error instanceof IndicatorError ||
    error instanceof StrategyEngineError ||
    error instanceof PositionUntrackedError
  ) {
    return LIVE_ERROR_CODE.ENGINE_FAILED;
  }
  return LIVE_ERROR_CODE.LIVE_UNEXPECTED;
}
