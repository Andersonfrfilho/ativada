// Copyright (c) 2026 Ada Technology. All rights reserved.
import { StrategyEngineError } from '../strategy-engine.error.js';
import type { GoalErrorCode } from './goal.constant.js';

// A mensagem é escrita por nós e nunca repete o valor recebido; `issues` leva só o CAMINHO dos campos inválidos.
export class GoalInputError extends StrategyEngineError {
  readonly code: GoalErrorCode;
  readonly issues: readonly string[];

  constructor(code: GoalErrorCode, message: string, issues: readonly string[] = []) {
    super(message);
    this.code = code;
    this.issues = issues;
  }
}
