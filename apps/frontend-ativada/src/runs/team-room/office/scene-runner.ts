// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OfficePhase, OfficePlan } from './office.constant.js';

export type SceneClock = {
  readonly now: () => number;
  // Agenda e devolve a função que cancela.
  readonly setTimer: (callback: () => void, milliseconds: number) => () => void;
};

export type SceneRunnerParams = {
  readonly plan: OfficePlan;
  readonly clock: SceneClock;
  // As fases que já começaram (acumuladas): o CSS lê a lista e nunca volta atrás no meio da sequência.
  readonly onPhases: (phases: readonly OfficePhase[]) => void;
  readonly onDone: () => void;
};

export type SceneRunner = {
  readonly start: () => void;
  readonly pause: () => void;
  readonly resume: () => void;
  readonly stop: () => void;
};

type RunnerState = {
  elapsed: number;
  startedAt: number;
  cancels: (() => void)[];
  isRunning: boolean;
};

function clearAll(state: RunnerState): void {
  state.cancels.forEach((cancel) => cancel());
  state.cancels = [];
}

function phasesUpTo(plan: OfficePlan, milliseconds: number): readonly OfficePhase[] {
  return plan.steps.filter((step) => step.at <= milliseconds).map((step) => step.phase);
}

// Agenda só o que falta a partir de `state.elapsed`: cada passo emite as fases acumuladas e o fim chama `onDone` uma vez.
function schedule(params: SceneRunnerParams, state: RunnerState): void {
  const { plan, clock, onPhases, onDone } = params;
  state.startedAt = clock.now();
  onPhases(phasesUpTo(plan, state.elapsed));
  for (const step of plan.steps) {
    if (step.at <= state.elapsed) continue;
    const delay = step.at - state.elapsed;
    state.cancels.push(clock.setTimer(() => onPhases(phasesUpTo(plan, step.at)), delay));
  }
  const finish = (): void => {
    state.isRunning = false;
    onDone();
  };
  state.cancels.push(clock.setTimer(finish, plan.endsAt - state.elapsed));
}

// O relógio da coreografia, pausável: pausar guarda o que já passou e retomar agenda só o que falta. A hora e os
// temporizadores entram por parâmetro, então o teste anda o tempo sem dormir.
export function createSceneRunner(params: SceneRunnerParams): SceneRunner {
  const state: RunnerState = { elapsed: 0, startedAt: 0, cancels: [], isRunning: false };
  return {
    start: (): void => {
      clearAll(state);
      state.elapsed = 0;
      state.isRunning = true;
      schedule(params, state);
    },
    pause: (): void => {
      if (!state.isRunning || state.cancels.length === 0) return;
      state.elapsed += params.clock.now() - state.startedAt;
      clearAll(state);
    },
    resume: (): void => {
      if (!state.isRunning || state.cancels.length > 0) return;
      schedule(params, state);
    },
    stop: (): void => {
      state.isRunning = false;
      clearAll(state);
    },
  };
}
