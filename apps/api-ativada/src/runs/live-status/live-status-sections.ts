// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  POSITION_STATUS,
  RUN_STATUS,
  type EquityPointInput,
  type PositionInput,
} from '@ativada/database';
import { formatEngineDecimal, parseGoalSpec, toEngineDecimal } from '@ativada/strategy-engine';

import { toWaitingForData } from '../run-view.js';
import { findDueAt } from '../stall/stall-policy.js';
import { computeBuyAndHold, computeLiveBalance, type LiveBalance } from './live-balance.js';
import { computeLiveGoalProgress } from './live-goal-progress.js';
import type { LiveRunContext } from './live-status-context.js';
import {
  buildBalanceMessage,
  buildBuyAndHoldMessage,
  buildGoalMessage,
} from './live-status-messages.js';
import type {
  BalanceSectionView,
  BuyAndHoldSectionView,
  GoalSectionView,
  LiveRunSectionView,
  OpenPositionView,
} from './live-status-view.js';

const canonical = (text: string): string => formatEngineDecimal(toEngineDecimal(text));

export function readGoalSnapshot(request: unknown): unknown {
  if (typeof request !== 'object' || request === null || Array.isArray(request)) return undefined;
  return Object.getOwnPropertyDescriptor(request, 'goal')?.value;
}

// A execução e a vela: a última decisão é o FECHAMENTO da última vela e a próxima é a vela devida (spec 006, P1).
export function buildRunSection(context: LiveRunContext): LiveRunSectionView {
  const { run, parameters, durationMilliseconds } = context;
  const isRunning = run.status === RUN_STATUS.RUNNING;
  return {
    id: run.id,
    status: run.status,
    symbol: run.symbol,
    timeframe: run.timeframe,
    periodStart: run.periodStart,
    lastCandleTime: run.lastCandleTime ?? null,
    lastDecisionAt:
      run.lastCandleTime === undefined ? null : run.lastCandleTime + durationMilliseconds,
    nextDecisionAt: isRunning
      ? findDueAt({
          timeframe: parameters.timeframe,
          lastCandleTime: run.lastCandleTime,
          startedAt: (run.startedAt ?? run.createdAt).getTime(),
        })
      : null,
    waitingForData: toWaitingForData(run),
    ...(isRunning && run.stalledSince !== undefined ? { stalledSince: run.stalledSince } : {}),
  };
}

export function buildBalanceSection(
  context: LiveRunContext,
  equityPoint: EquityPointInput | undefined,
): { readonly balance: LiveBalance; readonly view: BalanceSectionView } {
  const balance = computeLiveBalance({
    initial: context.parameters.initialBalance,
    latestEquity: equityPoint?.equity,
  });
  const message = buildBalanceMessage({ balance, hasEquityPoint: equityPoint !== undefined });
  const observedAt =
    equityPoint === undefined ? null : equityPoint.candleTime + context.durationMilliseconds;
  return { balance, view: { ...balance, observedAt, message } };
}

// O "comprar e segurar" é o `benchmark` gravado no mesmo ponto: sem ponto não há comparação.
export function buildBuyAndHoldSection(
  balance: LiveBalance,
  equityPoint: EquityPointInput | undefined,
): BuyAndHoldSectionView | null {
  if (equityPoint === undefined) return null;
  const buyAndHold = computeBuyAndHold({
    initial: balance.initial,
    current: balance.current,
    benchmark: equityPoint.benchmark,
  });
  return { ...buyAndHold, message: buildBuyAndHoldMessage(buyAndHold) };
}

// A meta da simulação: a fotografia gravada no pedido (`runs.request.goal`), o mesmo prazo e níveis que o worker usa.
export function buildGoalSection(
  context: LiveRunContext,
  params: { readonly balance: LiveBalance; readonly now: number },
): GoalSectionView | null {
  const { run } = context;
  if (run.goalId === undefined) return null;
  const goal = parseGoalSpec(readGoalSnapshot(run.request));
  const progress = computeLiveGoalProgress({
    goal,
    initial: params.balance.initial,
    current: params.balance.current,
    periodStart: run.periodStart,
    now: params.now,
  });
  const outcome = run.goalOutcome;
  return {
    ...progress,
    outcome: outcome ?? null,
    outcomeAt:
      run.goalOutcomeCandleTime === undefined
        ? null
        : run.goalOutcomeCandleTime + context.durationMilliseconds,
    message: buildGoalMessage({ progress, horizonDays: goal.horizonDays, outcome }),
  };
}

export function buildOpenPosition(positions: readonly PositionInput[]): OpenPositionView | null {
  const open = positions.find((position) => position.status === POSITION_STATUS.OPEN);
  if (open === undefined) return null;
  return {
    entryPrice: canonical(open.entryPrice),
    quantity: canonical(open.quantity),
    targetPrice: canonical(open.targetPrice),
    stopPrice: canonical(open.stopPrice),
    openedCandleTime: open.openedCandleTime,
  };
}
