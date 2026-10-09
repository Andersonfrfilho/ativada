// Copyright (c) 2026 Ada Technology. All rights reserved.
export class UserResolutionError extends Error {
  constructor() {
    super('Usuário não encontrado depois da inserção: a linha foi removida durante a resolução.');
    this.name = 'UserResolutionError';
  }
}
