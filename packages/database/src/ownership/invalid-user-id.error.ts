// Copyright (c) 2026 Ada Technology. All rights reserved.
export class InvalidUserIdError extends Error {
  constructor() {
    super('Identificador de usuário inválido: esperado UUID em minúsculas.');
    this.name = 'InvalidUserIdError';
  }
}
