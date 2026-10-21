// Copyright (c) 2026 Ada Technology. All rights reserved.

// Agenda e devolve a função que cancela. Em produção é o `setTimeout`; o teste entrega um relógio falso.
export type MotionTimer = (callback: () => void, milliseconds: number) => () => void;

export const REAL_TIMER: MotionTimer = (callback, milliseconds) => {
  const id = setTimeout(callback, milliseconds);
  return () => clearTimeout(id);
};

export type Cue<T> = { readonly at: number; readonly payload: T };

export type Cycle<T> = {
  // As pistas em ordem de `at` (milissegundos desde o começo do ciclo).
  readonly cues: readonly Cue<T>[];
  // Quando o ciclo acaba e o próximo começa.
  readonly lengthMilliseconds: number;
};

export type CueRunnerParams<T> = {
  readonly cycleOf: (cycle: number) => Cycle<T>;
  readonly timer: MotionTimer;
  readonly onCue: (payload: T) => void;
};

export type CueRunner = {
  readonly start: () => void;
  readonly stop: () => void;
};

const MIN_DELAY_MILLISECONDS = 50;

type RunnerState = {
  cycle: number;
  index: number;
  lastAt: number;
  cancel: (() => void) | undefined;
};

// O relógio ÚNICO de uma cena: executa as pistas de cada ciclo, uma de cada vez, com no máximo UM temporizador pendente.
// Nenhum agente tem relógio próprio. `stop` cancela o pendente; `start` retoma do começo do ciclo atual.
export function createCueRunner<T>(params: CueRunnerParams<T>): CueRunner {
  const { cycleOf, timer, onCue } = params;
  const state: RunnerState = { cycle: 0, index: 0, lastAt: 0, cancel: undefined };
  function step(): void {
    const current = cycleOf(state.cycle);
    const cue = current.cues[state.index];
    if (cue !== undefined) {
      state.lastAt = cue.at;
      state.index += 1;
      onCue(cue.payload);
    } else {
      state.cycle += 1;
      state.index = 0;
      state.lastAt = 0;
    }
    arm();
  }
  function arm(): void {
    const current = cycleOf(state.cycle);
    const nextAt = current.cues[state.index]?.at ?? current.lengthMilliseconds;
    const delay = Math.max(nextAt - state.lastAt, MIN_DELAY_MILLISECONDS);
    state.cancel = timer(step, delay);
  }
  return {
    start: (): void => {
      if (state.cancel !== undefined) return;
      state.index = 0;
      state.lastAt = 0;
      arm();
    },
    stop: (): void => {
      state.cancel?.();
      state.cancel = undefined;
    },
  };
}
