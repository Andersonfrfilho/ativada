// Copyright (c) 2026 Ada Technology. All rights reserved.
import { StrategyEngineError } from '../strategy-engine.error.js';
import type { SurvivalErrorCode } from './survival.constant.js';

// A mensagem é escrita por nós e nunca repete o valor recebido: o código estável é o que o chamador usa. `issues` leva só
// o CAMINHO dos campos inválidos (`floorRate`, `doubleRate`; vazio para campo desconhecido), para a tela marcar cada um.
export class SurvivalInputError extends StrategyEngineError {
  readonly code: SurvivalErrorCode;
  readonly issues: readonly string[];

  constructor(code: SurvivalErrorCode, message: string, issues: readonly string[] = []) {
    super(message);
    this.code = code;
    this.issues = issues;
  }
}
