// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { BacktestErrorCode } from './backtest.constant.js';

// A mensagem de um BacktestError é escrita por nós e nunca leva dado de usuário, segredo nem texto de driver.
export class BacktestError extends Error {
  readonly code: BacktestErrorCode;

  constructor(code: BacktestErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}
