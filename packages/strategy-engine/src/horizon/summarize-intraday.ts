// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, formatEngineDecimal, toEngineDecimal } from '../engine-decimal.js';
import {
  HORIZON_RATE_DECIMAL_PLACES,
  HORIZON_RECOMMENDATION_RULES,
  INTRADAY_VERDICT,
} from './horizon.constant.js';
import type { IntradayMetricsInput, IntradaySummary } from './horizon.types.js';

const ZERO = new EngineDecimal(0);

// Veredito da operação em velas de 15 minutos. O líquido é o patrimônio final (posição aberta inclusa) menos o saldo
// inicial; o bruto é o líquido MAIS as taxas pagas (o `grossProfit` das métricas já vem depois das taxas). O slippage
// está embutido no preço de cada ordem e não faz parte das taxas pagas.
export function summarizeIntraday(metrics: IntradayMetricsInput): IntradaySummary {
  const feesPaid = toEngineDecimal(metrics.feesPaid);
  const common = { tradeCount: metrics.trades, feesPaid: metrics.feesPaid };
  if (metrics.finalEquity === null) {
    return {
      ...common,
      netReturn: null,
      feeShareOfGross: null,
      verdict: INTRADAY_VERDICT.NOT_WORTH,
    };
  }
  const initial = toEngineDecimal(metrics.initialBalance);
  const net = toEngineDecimal(metrics.finalEquity).minus(initial);
  const gross = net.plus(feesPaid);
  const isGrossPositive = gross.greaterThan(ZERO);
  const hasFeesAboveLimit =
    isGrossPositive &&
    feesPaid.greaterThan(gross.times(HORIZON_RECOMMENDATION_RULES.maximumFeeShare));
  const isWorth = net.greaterThan(ZERO) && !hasFeesAboveLimit;
  return {
    ...common,
    netReturn: formatEngineDecimal(
      net
        .dividedBy(initial)
        .toDecimalPlaces(HORIZON_RATE_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR),
    ),
    feeShareOfGross: isGrossPositive
      ? formatEngineDecimal(
          feesPaid
            .dividedBy(gross)
            .toDecimalPlaces(HORIZON_RATE_DECIMAL_PLACES, EngineDecimal.ROUND_CEIL),
        )
      : null,
    verdict: isWorth ? INTRADAY_VERDICT.WORTH : INTRADAY_VERDICT.NOT_WORTH,
  };
}
