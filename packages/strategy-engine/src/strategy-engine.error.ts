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

// Entrada do passo que violaria o contrato: candle fora de ordem, de outro par, dado do futuro.
export class EngineInputError extends StrategyEngineError {}
