// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readJsonb } from '../jsonb.js';
import { strategies, strategyVersions } from '../schema/strategies.schema.js';
import type { StrategyVersionRecord } from './strategy.types.js';

export const STRATEGY_COLUMNS = {
  id: strategies.id,
  name: strategies.name,
  isExample: strategies.isExample,
  createdAt: strategies.createdAt,
  updatedAt: strategies.updatedAt,
} as const;

export const VERSION_COLUMNS = {
  id: strategyVersions.id,
  strategyId: strategyVersions.strategyId,
  version: strategyVersions.version,
  config: strategyVersions.config,
  configHash: strategyVersions.configHash,
  createdAt: strategyVersions.createdAt,
} as const;

type VersionRow = Omit<StrategyVersionRecord, 'config'> & { readonly config: unknown };

export function toVersionRecord(row: VersionRow): StrategyVersionRecord {
  return { ...row, config: readJsonb(row.config) };
}
