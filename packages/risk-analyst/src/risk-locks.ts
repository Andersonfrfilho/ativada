// Copyright (c) 2026 Ada Technology. All rights reserved.
import { computeGoalLevels, formatEngineDecimal, type GoalSpec } from '@ativada/strategy-engine';

import { ANALYST_RULES, CANDLE_MILLISECONDS, LOCK_KEY } from './analyst.constant.js';
import { divideDown, divideUp, decimalOf } from './analyst-decimal.js';
import type { AnalystPosition, AnalystWallet, RiskLock } from './analyst-decision.types.js';

export type RiskLockContext = {
  readonly candleTime: number;
  readonly wallet: AnalystWallet;
  readonly goal: GoalSpec | null;
  readonly riskPerTrade: string;
  readonly atrRate: string | null;
  readonly roundTripCost: string;
  readonly moveToCost: string | null;
};

// Perda realizada + não realizada em 24 h: o patrimônio de `t − 96·d` (ou o saldo inicial) menos o de agora.
function computeDailyLoss(context: RiskLockContext): RiskLock {
  const { wallet } = context;
  const initial = decimalOf(wallet.initialBalance);
  const reference = decimalOf(wallet.equityReference ?? wallet.initialBalance);
  const loss = reference.minus(wallet.equity);
  return {
    key: LOCK_KEY.DAILY_LOSS,
    current: loss.lte(0) ? '0' : divideUp(loss, initial),
    limit: ANALYST_RULES.dailyLossRate,
    isActive: loss.gte(initial.times(ANALYST_RULES.dailyLossRate)),
    isApplicable: true,
  };
}

type ClosedPosition = { readonly closedCandleTime: number; readonly netProfit: string };

function closedNewestFirst(
  positions: readonly AnalystPosition[],
  candleTime: number,
): readonly ClosedPosition[] {
  return positions
    .flatMap(({ closedCandleTime, netProfit }) =>
      closedCandleTime === null || netProfit === null || closedCandleTime > candleTime
        ? []
        : [{ closedCandleTime, netProfit }],
    )
    .sort((left, right) => right.closedCandleTime - left.closedCandleTime);
}

// Perdas seguidas desde a posição fechada mais nova; a pausa dura 4 velas depois da última (1 h).
function computeLossStreak(context: RiskLockContext): RiskLock {
  const closed = closedNewestFirst(context.wallet.positions, context.candleTime);
  const streak = closed.findIndex((position) => !decimalOf(position.netProfit).lt(0));
  const lossCount = streak === -1 ? closed.length : streak;
  const newest = closed[0];
  const pauseMilliseconds = ANALYST_RULES.lossStreakPauseCandles * CANDLE_MILLISECONDS;
  const isPaused =
    newest !== undefined && context.candleTime - newest.closedCandleTime < pauseMilliseconds;
  return {
    key: LOCK_KEY.LOSS_STREAK,
    current: String(lossCount),
    limit: String(ANALYST_RULES.lossStreakLimit),
    isActive: lossCount >= ANALYST_RULES.lossStreakLimit && isPaused,
    isApplicable: true,
  };
}

// Entradas em (t − 96·d, t]: a aberta conta, a fechada também.
function computeTradeCount(context: RiskLockContext): RiskLock {
  const oldest = context.candleTime - ANALYST_RULES.lossWindowCandles * CANDLE_MILLISECONDS;
  const count = context.wallet.positions.filter(
    ({ openedCandleTime }) => openedCandleTime > oldest && openedCandleTime <= context.candleTime,
  ).length;
  return {
    key: LOCK_KEY.TRADE_COUNT,
    current: String(count),
    limit: String(ANALYST_RULES.tradeCountLimit),
    isActive: count >= ANALYST_RULES.tradeCountLimit,
    isApplicable: true,
  };
}

// Folga até a perda máxima da meta: pausa se cabem menos que 2 vezes o risco de uma operação (sem dividir na decisão).
function computeGoalRoom(context: RiskLockContext): RiskLock {
  const { goal, wallet, riskPerTrade } = context;
  const multiple = ANALYST_RULES.goalRoomTradeMultiple;
  const minimumRate = formatEngineDecimal(decimalOf(riskPerTrade).times(multiple));
  if (goal === null) {
    return {
      key: LOCK_KEY.GOAL_ROOM,
      current: null,
      limit: minimumRate,
      isActive: false,
      isApplicable: false,
    };
  }
  const equity = decimalOf(wallet.equity);
  const { stop } = computeGoalLevels({ initial: decimalOf(wallet.initialBalance), goal });
  const room = equity.minus(stop);
  return {
    key: LOCK_KEY.GOAL_ROOM,
    current: divideDown(room, equity),
    limit: minimumRate,
    isActive: room.lt(equity.times(minimumRate)),
    isApplicable: true,
  };
}

// O movimento típico (ATR em %) precisa pagar pelo menos o dobro do custo de ida e volta.
function computeMoveCost(context: RiskLockContext): RiskLock {
  const { atrRate, roundTripCost, moveToCost } = context;
  const minimum = decimalOf(roundTripCost).times(ANALYST_RULES.minimumMoveToCost);
  return {
    key: LOCK_KEY.MOVE_COST,
    current: moveToCost,
    limit: ANALYST_RULES.minimumMoveToCost,
    isActive: atrRate !== null && decimalOf(atrRate).lt(minimum),
    isApplicable: true,
  };
}

// As cinco travas, todas calculadas e mostradas, na ordem da A10: a primeira ativa dá o motivo da pausa.
export function computeRiskLocks(context: RiskLockContext): readonly RiskLock[] {
  return [
    computeDailyLoss(context),
    computeLossStreak(context),
    computeTradeCount(context),
    computeGoalRoom(context),
    computeMoveCost(context),
  ];
}
