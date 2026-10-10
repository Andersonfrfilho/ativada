// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle } from '../engine-candle.types.js';
import { toEngineDecimal } from '../engine-decimal.js';
import { createInitialWalletState } from '../engine-state.js';
import type { RunSetup, StrategyVersion } from '../strategy-config.types.js';
import { buyBenchmark, benchmarkValue } from '../wallet/wallet-valuation.js';
import { createWalletDraft, type WalletContext } from '../wallet/wallet.types.js';
import type { GoalPoint } from './goal.types.js';

export type GoalBenchmarkParams = {
  readonly strategy: StrategyVersion;
  readonly run: RunSetup;
  readonly candles: readonly EngineCandle[];
  // Índice do primeiro candle da janela (o do primeiro sinal da carteira).
  readonly windowStart: number;
};

function contextAt(params: GoalBenchmarkParams, candle: EngineCandle): WalletContext {
  return { config: params.strategy.config, parameters: params.run.parameters, candle };
}

// "Comprar e segurar" da janela, pelo MESMO modelo da carteira: compra com todo o saldo na abertura do candle
// seguinte ao primeiro sinal (taxa, slippage e arredondamentos do motor) e vale, em cada candle, o que a liquidação
// renderia. No primeiro candle ainda não comprou: vale o saldo inicial. Não tem vale: o fechamento serve às duas pontas.
export function createBenchmarkReader(params: GoalBenchmarkParams): (offset: number) => GoalPoint {
  const { strategy, run, candles, windowStart } = params;
  const initial = toEngineDecimal(run.parameters.initialBalance);
  const first = candles[windowStart];
  const buyCandle = candles[windowStart + 1];
  const initialPoint: GoalPoint = { equity: initial, equityAtLow: initial };
  if (first === undefined || buyCandle === undefined) return () => initialPoint;
  const wallet = createInitialWalletState({ strategy, run });
  const draft = createWalletDraft({ ...wallet, firstSignalCandleOpenTime: first.openTime });
  buyBenchmark(draft, contextAt(params, buyCandle));
  return (offset) => {
    const candle = candles[windowStart + offset];
    if (offset === 0 || candle === undefined) return initialPoint;
    const value = toEngineDecimal(benchmarkValue(draft, contextAt(params, candle)));
    return { equity: value, equityAtLow: value };
  };
}
