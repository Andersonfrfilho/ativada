// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createEngine,
  EngineInputError,
  ENGINE_INPUT_ERROR_CODE,
  type Engine,
  type StepInput,
  type StepResult,
} from '../../../packages/strategy-engine/src/index.js';

export type CountingEngine = {
  readonly engine: Engine;
  readonly steps: () => number;
  readonly openTimes: readonly number[];
};

export type EngineFailure = {
  // Passo (1 = o primeiro) em que o motor lança.
  readonly atStep: number;
  readonly error: Error;
};

// O motor de produção, com contagem de passos e, se pedido, uma falha injetada.
export function createCountingEngine(failure?: EngineFailure): CountingEngine {
  const inner = createEngine();
  const openTimes: number[] = [];
  const step = (input: StepInput): StepResult => {
    openTimes.push(input.candle.openTime);
    if (failure !== undefined && openTimes.length === failure.atStep) throw failure.error;
    return inner.step(input);
  };
  return { engine: { ...inner, step }, steps: () => openTimes.length, openTimes };
}

export function engineRefusal(): EngineInputError {
  return new EngineInputError({
    code: ENGINE_INPUT_ERROR_CODE.CANDLE_INSANE,
    message: 'candle recusado de propósito',
  });
}
