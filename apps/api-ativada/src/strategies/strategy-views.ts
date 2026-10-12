// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonValue, StrategyRecord, StrategyVersionRecord } from '@ativada/database';

// O que a API devolve: sem dono. O hash da versão (SHA-256 da configuração) é público para o dono: o painel o mostra.
export type StrategyView = {
  readonly id: string;
  readonly name: string;
  readonly isExample: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type StrategyVersionView = {
  readonly id: string;
  readonly strategyId: string;
  readonly version: number;
  readonly config: JsonValue;
  readonly configHash: string;
  readonly createdAt: string;
};

export function toStrategyView(record: StrategyRecord): StrategyView {
  return {
    id: record.id,
    name: record.name,
    isExample: record.isExample,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toStrategyVersionView(record: StrategyVersionRecord): StrategyVersionView {
  return {
    id: record.id,
    strategyId: record.strategyId,
    version: record.version,
    config: record.config,
    configHash: record.configHash,
    createdAt: record.createdAt.toISOString(),
  };
}
