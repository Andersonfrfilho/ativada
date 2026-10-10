// Copyright (c) 2026 Ada Technology. All rights reserved.
import { StrategyEngineError } from '../strategy-engine.error.js';
import type { WalkForwardErrorCode } from './walk-forward.constant.js';

export type WalkForwardErrorDetails = Readonly<Record<string, number>>;

// A mensagem é escrita por nós e `details` leva só contagens: nada que o usuário digitou volta no erro.
export class WalkForwardError extends StrategyEngineError {
  readonly code: WalkForwardErrorCode;
  readonly details: WalkForwardErrorDetails;

  constructor(params: {
    readonly code: WalkForwardErrorCode;
    readonly message: string;
    readonly details?: WalkForwardErrorDetails;
  }) {
    super(params.message);
    this.code = params.code;
    this.details = params.details ?? {};
  }
}
