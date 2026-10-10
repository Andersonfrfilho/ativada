// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatEngineDecimal } from '../engine-decimal.js';
import type { TradeMetrics } from './metrics.types.js';
import type { ParsedOpenPosition, ParsedTrade } from './trade-input.js';
import { computeTradeRatios } from './trade-ratios.js';
import { countExitReasons, findLongestLosingStreak, sumFees, sumTrades } from './trade-totals.js';

export function computeTradeMetrics(params: {
  readonly trades: readonly ParsedTrade[];
  readonly openPosition: ParsedOpenPosition | null;
}): TradeMetrics {
  const { trades, openPosition } = params;
  const totals = sumTrades(trades);
  return {
    trades: totals.count,
    wins: totals.wins,
    losses: totals.losses,
    ...computeTradeRatios(totals),
    maxConsecutiveLosses: findLongestLosingStreak(trades),
    feesPaid: formatEngineDecimal(sumFees(trades, openPosition)),
    grossProfit: formatEngineDecimal(totals.grossProfit),
    grossLoss: formatEngineDecimal(totals.grossLoss),
    netProfit: formatEngineDecimal(totals.netProfit),
    exitReasonCounts: countExitReasons(trades),
  };
}
