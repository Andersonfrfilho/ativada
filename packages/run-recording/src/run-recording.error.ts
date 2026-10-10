// Copyright (c) 2026 Ada Technology. All rights reserved.

// A mensagem é escrita por nós e nunca leva dado de usuário, segredo nem texto de driver.
export class PositionUntrackedError extends Error {
  constructor() {
    super('O motor fechou uma posição que não foi aberta nesta execução.');
    this.name = new.target.name;
  }
}
