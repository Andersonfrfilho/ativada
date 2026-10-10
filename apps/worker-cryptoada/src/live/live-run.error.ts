// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { LiveErrorCode } from './live.constant.js';

// A mensagem de um LiveRunError é escrita por nós e nunca leva dado de usuário, segredo nem texto de driver.
export class LiveRunError extends Error {
  readonly code: LiveErrorCode;

  constructor(code: LiveErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}
