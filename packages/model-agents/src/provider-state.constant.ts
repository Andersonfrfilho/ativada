// Copyright (c) 2026 Ada Technology. All rights reserved.
// RF20: o estado de um provedor para o painel; os seis valores saem do batimento do worker (RF22).
export const PROVIDER_STATE = {
  READY: 'ready',
  NO_KEY: 'no_key',
  BUDGET_EXHAUSTED: 'budget_exhausted',
  CIRCUIT_OPEN: 'circuit_open',
  KEY_REJECTED: 'key_rejected',
  MODEL_NOT_FOUND: 'model_not_found',
} as const;
export type ProviderState = (typeof PROVIDER_STATE)[keyof typeof PROVIDER_STATE];
