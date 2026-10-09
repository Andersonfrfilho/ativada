// Copyright (c) 2026 Ada Technology. All rights reserved.
export class AccountNotDeletedError extends Error {
  constructor() {
    super('A conta não está marcada como apagada: nada é purgado.');
    this.name = 'AccountNotDeletedError';
  }
}

export class OwnedTableWithoutDeletionStepError extends Error {
  constructor(tableName: string) {
    super(`A tabela de dono ${tableName} não tem passo de exclusão no registro.`);
    this.name = 'OwnedTableWithoutDeletionStepError';
  }
}
