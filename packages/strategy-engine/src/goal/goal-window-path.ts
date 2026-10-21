// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SignalDecision } from '../engine-decision.types.js';
import { SIGNAL_ACTION } from '../engine-vocabulary.constant.js';
import type { EngineDecimalValue } from '../engine-decimal.js';
import { createTrajectoryReader, type GoalTrajectoryContext } from './goal-trajectory.js';
import type { GoalPoint } from './goal.types.js';

export type GoalWindowPathParams = GoalTrajectoryContext & {
  readonly initial: EngineDecimalValue;
};

export type GoalWindowPath = (start: number) => (offset: number) => GoalPoint;

// Para cada candle, o índice da próxima compra a partir dele (ele incluso); `length` quando não há mais.
function indexNextBuys(signals: readonly (SignalDecision | null)[]): readonly number[] {
  const next = new Array<number>(signals.length + 1).fill(signals.length);
  for (let index = signals.length - 1; index >= 0; index -= 1) {
    const isBuy = signals[index]?.action === SIGNAL_ACTION.BUY;
    next[index] = isBuy ? index : (next[index + 1] ?? signals.length);
  }
  return next;
}

export function findFirstDecidedIndex(signals: readonly (SignalDecision | null)[]): number {
  const index = signals.findIndex((signal) => signal !== null);
  return index === -1 ? signals.length : index;
}

// O caminho da carteira de uma janela que começa em `start`: parada (saldo inicial) até a primeira compra e dali em
// diante a trajetória de uma carteira nova que entrou naquele candle, lida do cache compartilhado entre as janelas.
export function createGoalWindowPath(params: GoalWindowPathParams): GoalWindowPath {
  const { candles, horizonCandles, initial } = params;
  const nextBuys = indexNextBuys(params.signals);
  const readTrajectory = createTrajectoryReader(params);
  const flat: GoalPoint = { equity: initial, equityAtLow: initial };
  return (start) => {
    const buy = nextBuys[start] ?? candles.length;
    const trajectory = buy < start + horizonCandles ? readTrajectory(buy) : [];
    return (offset) => trajectory[start + offset - buy] ?? flat;
  };
}
