// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AnalystGoalSnapshot, RunRecord } from '@ativada/database';
import { buildGoalProgressMessage } from '@ativada/risk-analyst';
import { parseGoalSpec } from '@ativada/strategy-engine';

import { computeLiveBalance } from '../live-status/live-balance.js';
import { computeLiveGoalProgress } from '../live-status/live-goal-progress.js';
import { readGoalSnapshot } from '../live-status/live-status-sections.js';
import type { AnalystGoalProgressView } from './analyst.schema.js';

// A meta somada (D8): o resultado das operações soma no saldo. Nenhum cálculo novo: o resultado é o do saldo e o que falta
// é o da meta da spec 008 (mesmo prazo, mesma base); sem meta na simulação, `null`.
export function buildAnalystGoalProgress(params: {
  readonly run: RunRecord;
  readonly initialBalance: string;
  readonly snapshot: AnalystGoalSnapshot | undefined;
  readonly now: number;
}): AnalystGoalProgressView | null {
  const { run, snapshot } = params;
  if (run.goalId === undefined || snapshot === undefined) return null;
  const goal = parseGoalSpec(readGoalSnapshot(run.request));
  const balance = computeLiveBalance({
    initial: params.initialBalance,
    latestEquity: snapshot.latestEquity,
  });
  const progress = computeLiveGoalProgress({
    goal,
    initial: balance.initial,
    current: balance.current,
    periodStart: run.periodStart,
    now: params.now,
  });
  const view = {
    targetRate: goal.targetRate,
    summedRate: balance.resultRate,
    remainingRate: progress.remainingRate,
    trades: snapshot.closedPositions,
  };
  return { ...view, message: buildGoalProgressMessage(view) };
}
