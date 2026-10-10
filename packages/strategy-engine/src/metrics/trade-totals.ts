// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import { EXIT_REASON, type ExitReason } from '../engine-vocabulary.constant.js';
import type { ParsedOpenPosition, ParsedTrade } from './trade-input.js';

const ZERO = new EngineDecimal(0);

export type TradeTotals = {
  readonly count: number;
  readonly wins: number;
  readonly losses: number;
  readonly grossProfit: EngineDecimalValue;
  readonly grossLoss: EngineDecimalValue;
  readonly netProfit: EngineDecimalValue;
};

// `wins`: lucro > 0; `losses`: lucro < 0; zero não é uma nem outra. Somas exatas, sem arredondar.
export function sumTrades(trades: readonly ParsedTrade[]): TradeTotals {
  const winners = trades.filter((trade) => trade.netProfit.greaterThan(ZERO));
  const losers = trades.filter((trade) => trade.netProfit.lessThan(ZERO));
  const grossProfit = winners.reduce((sum, trade) => sum.plus(trade.netProfit), ZERO);
  const grossLoss = losers.reduce((sum, trade) => sum.minus(trade.netProfit), ZERO);
  return {
    count: trades.length,
    wins: winners.length,
    losses: losers.length,
    grossProfit,
    grossLoss,
    netProfit: grossProfit.minus(grossLoss),
  };
}

// Toda taxa que saiu do caixa: entrada e saída das fechadas, mais a entrada da posição ainda aberta.
export function sumFees(
  trades: readonly ParsedTrade[],
  openPosition: ParsedOpenPosition | null,
): EngineDecimalValue {
  const closedFees = trades.reduce(
    (sum, trade) => sum.plus(trade.entryFee).plus(trade.exitFee),
    ZERO,
  );
  return closedFees.plus(openPosition?.entryFee ?? ZERO);
}

export function findLongestLosingStreak(trades: readonly ParsedTrade[]): number {
  let longest = 0;
  let current = 0;
  for (const trade of trades) {
    current = trade.netProfit.lessThan(ZERO) ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

export function countExitReasons(trades: readonly ParsedTrade[]): Record<ExitReason, number> {
  const counts: Record<ExitReason, number> = {
    [EXIT_REASON.STOP]: 0,
    [EXIT_REASON.TARGET]: 0,
    [EXIT_REASON.SIGNAL]: 0,
    [EXIT_REASON.COMMAND]: 0,
    [EXIT_REASON.GAP]: 0,
  };
  for (const trade of trades) counts[trade.exitReason] += 1;
  return counts;
}
