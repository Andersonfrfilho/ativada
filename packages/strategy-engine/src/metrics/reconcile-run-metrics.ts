// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, formatEngineDecimal } from '../engine-decimal.js';
import { parseFiniteDecimal } from './metrics-input.js';
import type { RunMetrics, RunReconciliation } from './metrics.types.js';

const ZERO = new EngineDecimal(0);

// Em decimal exato, sem tolerância: lucro líquido das fechadas + lucro não realizado = patrimônio final − saldo
// inicial. As taxas já estão dentro dos dois termos; descontá-las outra vez as contaria duas vezes.
export function reconcileRunMetrics(metrics: RunMetrics): RunReconciliation {
  const initial = parseFiniteDecimal(metrics.initialBalance, 'initialBalance');
  const expected =
    metrics.finalEquity === null
      ? ZERO
      : parseFiniteDecimal(metrics.finalEquity, 'finalEquity').minus(initial);
  const realized = parseFiniteDecimal(metrics.netProfit, 'netProfit');
  const unrealized = parseFiniteDecimal(
    metrics.openPosition?.unrealizedProfit ?? '0',
    'unrealizedProfit',
  );
  const accounted = realized.plus(unrealized);
  return {
    expectedVariation: formatEngineDecimal(expected),
    realizedProfit: formatEngineDecimal(realized),
    unrealizedProfit: formatEngineDecimal(unrealized),
    accountedVariation: formatEngineDecimal(accounted),
    difference: formatEngineDecimal(accounted.minus(expected)),
    isReconciled: accounted.equals(expected),
  };
}
