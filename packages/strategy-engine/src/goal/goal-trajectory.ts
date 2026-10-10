// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle } from '../engine-candle.types.js';
import type { SignalDecision } from '../engine-decision.types.js';
import { createInitialWalletState } from '../engine-state.js';
import { toEngineDecimal } from '../engine-decimal.js';
import type { RunSetup, StrategyVersion } from '../strategy-config.types.js';
import { StrategyEngineError } from '../strategy-engine.error.js';
import { walletStep } from '../wallet/wallet-step.js';
import type { GoalPoint } from './goal.types.js';

export type GoalTrajectoryContext = {
  readonly strategy: StrategyVersion;
  readonly run: RunSetup;
  readonly candles: readonly EngineCandle[];
  readonly signals: readonly (SignalDecision | null)[];
  readonly horizonCandles: number;
};

// Uma carteira nova entra no candle `startIndex` (um BUY) e anda até o fim do prazo ou da série. Uma janela cuja
// carteira estava parada antes disso (HOLD e SELL de carteira livre não fazem nada) tem exatamente esta trajetória:
// por isso todas as janelas com a mesma primeira compra a compartilham, e ela é calculada uma vez.
function walkTrajectory(context: GoalTrajectoryContext, startIndex: number): readonly GoalPoint[] {
  const { strategy, run, candles, signals } = context;
  let state = createInitialWalletState({ strategy, run });
  const points: GoalPoint[] = [];
  const end = Math.min(startIndex + context.horizonCandles, candles.length);
  for (let index = startIndex; index < end; index += 1) {
    const candle = candles[index];
    if (candle === undefined) break;
    const result = walletStep({ strategy, run, state, candle, signal: signals[index] ?? null });
    state = result.state;
    const point = result.decisions.equityPoint;
    if (point === null) throw new StrategyEngineError('Candle decidido sem ponto de patrimônio.');
    points.push({
      equity: toEngineDecimal(point.equity),
      equityAtLow: toEngineDecimal(point.equityAtLow),
    });
  }
  return points;
}

export type TrajectoryReader = (startIndex: number) => readonly GoalPoint[];

export function createTrajectoryReader(context: GoalTrajectoryContext): TrajectoryReader {
  const cache = new Map<number, readonly GoalPoint[]>();
  return (startIndex) => {
    const cached = cache.get(startIndex);
    if (cached !== undefined) return cached;
    const points = walkTrajectory(context, startIndex);
    cache.set(startIndex, points);
    return points;
  };
}
