// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import { availableMetric, unavailableMetric } from './metric-value.js';
import { METRIC_UNAVAILABLE_REASON, type MetricUnavailableReason } from './metrics.constant.js';
import type { MetricValue } from './metrics.types.js';
import type { TradeTotals } from './trade-totals.js';

const ZERO = new EngineDecimal(0);

export type TradeRatios = {
  readonly winRate: MetricValue;
  readonly profitFactor: MetricValue;
  readonly averageTrade: MetricValue;
  readonly expectancy: MetricValue;
  readonly averageWin: MetricValue;
  readonly averageLoss: MetricValue;
  readonly payoffRatio: MetricValue;
};

type Averages = {
  readonly win: EngineDecimalValue | null;
  readonly loss: EngineDecimalValue | null;
};

function computeAverages(totals: TradeTotals): Averages {
  return {
    win: totals.wins === 0 ? null : totals.grossProfit.dividedBy(totals.wins),
    loss: totals.losses === 0 ? null : totals.grossLoss.dividedBy(totals.losses),
  };
}

// taxa de acerto × ganho médio − taxa de perda × perda média, a 40 algarismos; média ausente pesa 0.
function computeExpectancy(totals: TradeTotals, averages: Averages): EngineDecimalValue {
  const winRate = new EngineDecimal(totals.wins).dividedBy(totals.count);
  const lossRate = new EngineDecimal(totals.losses).dividedBy(totals.count);
  const winPart = averages.win?.times(winRate) ?? ZERO;
  const lossPart = averages.loss?.times(lossRate) ?? ZERO;
  return winPart.minus(lossPart);
}

function computePayoff(averages: Averages): MetricValue {
  if (averages.win === null) return unavailableMetric(METRIC_UNAVAILABLE_REASON.NO_WINS);
  if (averages.loss === null) return unavailableMetric(METRIC_UNAVAILABLE_REASON.NO_LOSSES);
  return availableMetric(averages.win.dividedBy(averages.loss));
}

function metricOrReason(
  value: EngineDecimalValue | null,
  reason: MetricUnavailableReason,
): MetricValue {
  return value === null ? unavailableMetric(reason) : availableMetric(value);
}

function computeProfitFactor(totals: TradeTotals): MetricValue {
  if (totals.grossLoss.isZero()) return unavailableMetric(METRIC_UNAVAILABLE_REASON.NO_LOSSES);
  return availableMetric(totals.grossProfit.dividedBy(totals.grossLoss));
}

export function computeTradeRatios(totals: TradeTotals): TradeRatios {
  if (totals.count === 0) {
    const missing = unavailableMetric(METRIC_UNAVAILABLE_REASON.NO_TRADES);
    return {
      winRate: missing,
      profitFactor: missing,
      averageTrade: missing,
      expectancy: missing,
      averageWin: missing,
      averageLoss: missing,
      payoffRatio: missing,
    };
  }
  const averages = computeAverages(totals);
  return {
    winRate: availableMetric(new EngineDecimal(totals.wins).dividedBy(totals.count)),
    profitFactor: computeProfitFactor(totals),
    averageTrade: availableMetric(totals.netProfit.dividedBy(totals.count)),
    expectancy: availableMetric(computeExpectancy(totals, averages)),
    averageWin: metricOrReason(averages.win, METRIC_UNAVAILABLE_REASON.NO_WINS),
    averageLoss: metricOrReason(averages.loss, METRIC_UNAVAILABLE_REASON.NO_LOSSES),
    payoffRatio: computePayoff(averages),
  };
}
