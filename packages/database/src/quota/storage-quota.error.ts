// Copyright (c) 2026 Ada Technology. All rights reserved.
export const STORAGE_QUOTA_RESOURCE = {
  STRATEGIES: 'strategies',
  STRATEGY_VERSIONS: 'strategy_versions',
} as const;

export type StorageQuotaResource =
  (typeof STORAGE_QUOTA_RESOURCE)[keyof typeof STORAGE_QUOTA_RESOURCE];

// O teto de armazenamento do usuário foi atingido, conferido sob trava na MESMA transação do INSERT (dois pedidos
// simultâneos não passam juntos do limite). Quem chama traduz para o erro de domínio da sua rota.
export class StorageQuotaReachedError extends Error {
  constructor(readonly resource: StorageQuotaResource) {
    super(`Teto de armazenamento atingido: ${resource}.`);
    this.name = 'StorageQuotaReachedError';
  }
}
