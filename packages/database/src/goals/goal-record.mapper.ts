// Copyright (c) 2026 Ada Technology. All rights reserved.
import { goals } from '../schema/goals.schema.js';
import type { GoalRecord } from './goal.types.js';

export const GOAL_COLUMNS = {
  id: goals.id,
  symbol: goals.symbol,
  targetRate: goals.targetRate,
  horizonDays: goals.horizonDays,
  maxLossRate: goals.maxLossRate,
  isActive: goals.isActive,
  createdAt: goals.createdAt,
  updatedAt: goals.updatedAt,
} as const;

type GoalRow = {
  readonly [Key in keyof typeof GOAL_COLUMNS]: (typeof GOAL_COLUMNS)[Key]['_']['data'];
};

export function toGoalRecord(row: GoalRow): GoalRecord {
  return {
    id: row.id,
    symbol: row.symbol,
    targetRate: row.targetRate,
    horizonDays: row.horizonDays,
    maxLossRate: row.maxLossRate,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
