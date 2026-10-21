// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import { createBenchmarkReader } from '../goal/goal-benchmark.js';
import { createGoalWindowPath, findFirstDecidedIndex } from '../goal/goal-window-path.js';
import type { ComputeHorizonWindowsParams, HorizonWindows } from './horizon.types.js';

const ONE = new EngineDecimal(1);

function toReturn(equity: EngineDecimalValue, initial: EngineDecimalValue): EngineDecimalValue {
  return equity.dividedBy(initial).minus(ONE);
}

// Uma janela por candle decidido cujo prazo inteiro cabe na série (passo de 1 candle), as mesmas das metas. Cada uma
// vale o patrimônio de liquidação no último candle do prazo; a que não chegou a comprar vale exatamente o saldo inicial.
export function computeHorizonWindows(params: ComputeHorizonWindowsParams): HorizonWindows {
  const { strategy, run, candles, signals, horizonCandles, initial } = params;
  const pathAt = createGoalWindowPath(params);
  const finalOffset = horizonCandles - 1;
  const last = candles.length - horizonCandles;
  const returns: EngineDecimalValue[] = [];
  const benchmarkReturns: EngineDecimalValue[] = [];
  for (let start = findFirstDecidedIndex(signals); start <= last; start += 1) {
    returns.push(toReturn(pathAt(start)(finalOffset).equity, initial));
    const benchmark = createBenchmarkReader({ strategy, run, candles, windowStart: start });
    benchmarkReturns.push(toReturn(benchmark(finalOffset).equity, initial));
  }
  return { returns, benchmarkReturns };
}
