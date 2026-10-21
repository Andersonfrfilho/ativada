// Copyright (c) 2026 Ada Technology. All rights reserved.

export class StrategyEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export type StrategyConfigIssue = {
  readonly path: string;
  readonly message: string;
};

// Leva todos os problemas de uma vez: a tela de edição mostra cada campo inválido sem nova tentativa.
export class StrategyConfigError extends StrategyEngineError {
  readonly issues: readonly StrategyConfigIssue[];

  constructor(issues: readonly StrategyConfigIssue[]) {
    super(`Configuração de estratégia inválida: ${issues.length} problema(s).`);
    this.issues = issues;
  }
}

export const ENGINE_STATE_ERROR_CODE = {
  INVALID_JSON: 'invalid_json',
  UNSUPPORTED_VERSION: 'unsupported_version',
  INVALID_STATE: 'invalid_state',
  ENGINE_MISMATCH: 'engine_mismatch',
} as const;

export type EngineStateErrorCode =
  (typeof ENGINE_STATE_ERROR_CODE)[keyof typeof ENGINE_STATE_ERROR_CODE];

// Estado que não se lê nem se valida não é "retomado com defaults": a execução replica desde o início.
export class EngineStateError extends StrategyEngineError {
  readonly code: EngineStateErrorCode;
  readonly issues: readonly StrategyConfigIssue[];

  constructor(params: {
    readonly code: EngineStateErrorCode;
    readonly message: string;
    readonly issues?: readonly StrategyConfigIssue[];
  }) {
    super(params.message);
    this.code = params.code;
    this.issues = params.issues ?? [];
  }
}

export class RunParametersError extends StrategyEngineError {
  readonly issues: readonly StrategyConfigIssue[];

  constructor(issues: readonly StrategyConfigIssue[]) {
    super(`Parâmetros da execução inválidos: ${issues.length} problema(s).`);
    this.issues = issues;
  }
}

// Código estável por recusa: o chamador distingue "já processado, pule" de "entrada errada, pare".
export const ENGINE_INPUT_ERROR_CODE = {
  CONFIG_HASH_MISMATCH: 'CONFIG_HASH_MISMATCH',
  RUN_HASH_MISMATCH: 'RUN_HASH_MISMATCH',
  CANDLE_WRONG_MARKET: 'CANDLE_WRONG_MARKET',
  CANDLE_OFF_GRID: 'CANDLE_OFF_GRID',
  CANDLE_INSANE: 'CANDLE_INSANE',
  CANDLE_ALREADY_PROCESSED: 'CANDLE_ALREADY_PROCESSED',
  CANDLE_OUT_OF_ORDER: 'CANDLE_OUT_OF_ORDER',
  CANDLE_GAP_UNCONFIRMED: 'CANDLE_GAP_UNCONFIRMED',
  SENTIMENT_INVALID: 'SENTIMENT_INVALID',
  SENTIMENT_FROM_FUTURE: 'SENTIMENT_FROM_FUTURE',
  SIGNAL_MISMATCH: 'SIGNAL_MISMATCH',
  COMMAND_INVALID: 'COMMAND_INVALID',
  EXECUTION_REPORTS_UNSUPPORTED: 'EXECUTION_REPORTS_UNSUPPORTED',
  ENTRY_RISK_SCALE_INVALID: 'ENTRY_RISK_SCALE_INVALID',
} as const;

export type EngineInputErrorCode =
  (typeof ENGINE_INPUT_ERROR_CODE)[keyof typeof ENGINE_INPUT_ERROR_CODE];

// Entrada do passo que violaria o contrato: candle fora de ordem, de outro par, dado do futuro.
export class EngineInputError extends StrategyEngineError {
  readonly code: EngineInputErrorCode;

  constructor(params: { readonly code: EngineInputErrorCode; readonly message: string }) {
    super(params.message);
    this.code = params.code;
  }
}

export const INDICATOR_ERROR_CODE = {
  INVALID_CANDLE: 'INVALID_CANDLE',
  INVALID_PARAMETER: 'INVALID_PARAMETER',
  INVALID_SNAPSHOT: 'INVALID_SNAPSHOT',
  NON_FINITE_RESULT: 'NON_FINITE_RESULT',
  MISSING_VALUE: 'MISSING_VALUE',
} as const;

export type IndicatorErrorCode = (typeof INDICATOR_ERROR_CODE)[keyof typeof INDICATOR_ERROR_CODE];

// Dado ausente ou não finito, parâmetro inválido e snapshot alheio nunca viram `NaN` que atravessa;
// `MISSING_VALUE`: indicador sem valor depois do aquecimento (só o sentimento pode faltar).
export class IndicatorError extends StrategyEngineError {
  readonly code: IndicatorErrorCode;

  constructor(params: { readonly code: IndicatorErrorCode; readonly message: string }) {
    super(params.message);
    this.code = params.code;
  }
}
