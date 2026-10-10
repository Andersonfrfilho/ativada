// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EquityPointDecision } from '../engine-decision.types.js';
import { EngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import { StrategyEngineError } from '../strategy-engine.error.js';
import type { MetricsRun } from './metrics.types.js';

const ZERO = new EngineDecimal(0);

// Ponto de patrimônio já lido: decimais exatos e o instante do candle (`candleOpenTime`).
export type MetricsPoint = {
  readonly time: number;
  readonly equity: EngineDecimalValue;
  readonly low: EngineDecimalValue;
  readonly benchmark: EngineDecimalValue;
};

export function rejectMetricsInput(message: string): never {
  throw new StrategyEngineError(`Entrada de métricas inválida: ${message}`);
}

// Texto que não é decimal finito ("NaN", "Infinity", lixo) não vira número torto: é recusado na porta.
export function parseFiniteDecimal(text: string, label: string): EngineDecimalValue {
  let value: EngineDecimalValue;
  try {
    value = new EngineDecimal(text);
  } catch {
    return rejectMetricsInput(`${label} não é decimal.`);
  }
  if (!value.isFinite()) return rejectMetricsInput(`${label} não é finito.`);
  return value;
}

export function assertMetricsRun(run: MetricsRun): void {
  if (!parseFiniteDecimal(run.initialBalance, 'initialBalance').greaterThan(ZERO)) {
    rejectMetricsInput('o saldo inicial deve ser positivo.');
  }
  if (!Number.isSafeInteger(run.timeframeMilliseconds) || run.timeframeMilliseconds <= 0) {
    rejectMetricsInput('a duração do timeframe deve ser um inteiro positivo.');
  }
}

function parsePoint(point: EquityPointDecision): MetricsPoint {
  const equity = parseFiniteDecimal(point.equity, 'equity');
  const low = parseFiniteDecimal(point.equityAtLow, 'equityAtLow');
  const benchmark = parseFiniteDecimal(point.benchmark, 'benchmark');
  if (!Number.isSafeInteger(point.candleOpenTime)) rejectMetricsInput('candleOpenTime inválido.');
  if (!equity.greaterThan(ZERO)) rejectMetricsInput('o patrimônio deve ser positivo.');
  if (low.isNegative() || low.greaterThan(equity)) {
    rejectMetricsInput('equityAtLow deve estar entre 0 e equity.');
  }
  if (benchmark.isNegative()) rejectMetricsInput('a régua não pode ser negativa.');
  return { time: point.candleOpenTime, equity, low, benchmark };
}

// Lê e confere a série de patrimônio: em ordem estrita de tempo, patrimônio positivo, mínima abaixo do fechamento.
export function parseEquityPoints(points: readonly EquityPointDecision[]): MetricsPoint[] {
  const parsed = points.map(parsePoint);
  parsed.forEach((point, index) => {
    const previous = parsed[index - 1];
    if (previous !== undefined && point.time <= previous.time) {
      rejectMetricsInput('os pontos devem estar em ordem estrita de tempo.');
    }
  });
  return parsed;
}
