// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { GoalRecord } from '@ativada/database';

// O que a API devolve: sem dono (dado interno que a exportação também não leva).
export type GoalView = {
  readonly id: string;
  readonly symbol: string;
  readonly targetRate: string;
  readonly horizonDays: number;
  readonly maxLossRate: string;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export function toGoalView(record: GoalRecord): GoalView {
  return {
    id: record.id,
    symbol: record.symbol,
    targetRate: record.targetRate,
    horizonDays: record.horizonDays,
    maxLossRate: record.maxLossRate,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
