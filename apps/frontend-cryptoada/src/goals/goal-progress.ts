// Copyright (c) 2026 Ada Technology. All rights reserved.
import { FULL_PERCENT, MILLISECONDS_PER_DAY } from './goal.constant.js';

export type GoalProgressParams = {
  readonly targetRate: string;
  readonly maxLossRate: string;
  readonly horizonDays: number;
  readonly initialBalance: string;
  readonly equity: string;
  readonly startTime: number;
  readonly now: number;
};

export type GoalProgress = {
  readonly returnRatio: number;
  readonly targetPercent: number;
  readonly lossPercent: number;
  readonly remainingDays: number;
  readonly isOnPace: boolean;
};

function clampPercent(ratio: number): number {
  return Math.min(FULL_PERCENT, Math.max(0, Math.round(ratio * FULL_PERCENT)));
}

export function computeGoalProgress(params: GoalProgressParams): GoalProgress {
  const target = Number(params.targetRate);
  const maxLoss = Number(params.maxLossRate);
  const returnRatio = Number(params.equity) / Number(params.initialBalance) - 1;
  const elapsedDays = Math.max(0, (params.now - params.startTime) / MILLISECONDS_PER_DAY);
  const elapsedRatio = Math.min(1, elapsedDays / params.horizonDays);
  return {
    returnRatio,
    targetPercent: clampPercent(returnRatio / target),
    lossPercent: clampPercent(-returnRatio / maxLoss),
    remainingDays: Math.max(0, Math.ceil(params.horizonDays - elapsedDays)),
    isOnPace: returnRatio >= target * elapsedRatio,
  };
}
