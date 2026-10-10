// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { WalkForwardRunErrorCode } from './walk-forward.constant.js';

// A mensagem de um WalkForwardRunError é escrita por nós e nunca leva dado de usuário, segredo nem texto de driver.
export class WalkForwardRunError extends Error {
  readonly code: WalkForwardRunErrorCode;

  constructor(code: WalkForwardRunErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}
