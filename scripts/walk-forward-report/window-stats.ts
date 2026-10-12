// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle } from '../../packages/strategy-engine/src/index.js';
import type { DecimalText, WindowStats, WindowSummary } from './report.types.js';

const ZERO = 0;

function toNumber(text: DecimalText): number {
  return text === null ? ZERO : Number(text);
}

function median(sorted: readonly number[]): number {
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? ZERO;
  if (sorted.length % 2 === 1) return upper;
  return ((sorted[middle - 1] ?? ZERO) + upper) / 2;
}

function formatFraction(value: number): string {
  return value.toFixed(12);
}

function isLostOutOfSample(window: WindowSummary): boolean {
  if (!window.isEligible || window.inSampleSharpe === null) return false;
  return Number(window.inSampleSharpe) > ZERO && toNumber(window.totalReturn) < ZERO;
}

// Janela parada (nenhum parâmetro elegível) fica em caixa: conta como retorno 0 nas médias e é contada à parte.
export function computeWindowStats(windows: readonly WindowSummary[]): WindowStats {
  const returns = windows.map((window) => toNumber(window.totalReturn));
  const sorted = [...returns].sort((first, second) => first - second);
  const count = windows.length;
  const sum = (values: readonly number[]): number => values.reduce((a, b) => a + b, ZERO);
  return {
    windows: count,
    eligibleWindows: windows.filter((window) => window.isEligible).length,
    positiveWindows: returns.filter((value) => value > ZERO).length,
    meanReturn: count === 0 ? null : formatFraction(sum(returns) / count),
    medianReturn: count === 0 ? null : formatFraction(median(sorted)),
    worstReturn: count === 0 ? null : formatFraction(sorted[0] ?? ZERO),
    bestReturn: count === 0 ? null : formatFraction(sorted.at(-1) ?? ZERO),
    meanTrades: count === 0 ? null : (sum(windows.map((w) => w.trades)) / count).toFixed(1),
    lostOutOfSample: windows.filter(isLostOutOfSample).length,
    belowBenchmark: windows.filter(
      (window) => toNumber(window.totalReturn) < toNumber(window.benchmarkReturn),
    ).length,
  };
}

// Comprar na abertura do primeiro candle a partir de `fromTime` e segurar até o último fechamento (sem custos).
export function computeBuyAndHoldReturn(
  candles: readonly EngineCandle[],
  fromTime: number,
): DecimalText {
  const first = candles.find((candle) => candle.openTime >= fromTime);
  const last = candles.at(-1);
  if (first === undefined || last === undefined) return null;
  return formatFraction(Number(last.close) / Number(first.open) - 1);
}
