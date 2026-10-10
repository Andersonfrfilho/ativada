// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { createEngine, type Engine } from '../packages/strategy-engine/src/index.js';
import { loadWalkForwardApp } from './fixtures/walk-forward/walk-forward-app.fixture.js';
import {
  buildWalkForwardScenario,
  SCENARIO_GRID,
} from './fixtures/walk-forward/walk-forward-scenarios.fixture.js';

const { runWalkForward } = (await loadWalkForwardApp()).run;

const TIMEOUT_MILLISECONDS = 120_000;
const COMBINATIONS = 12;
const WINDOWS = 4;

function countingEngine(counter: { signalSteps: number }): Engine {
  const engine = createEngine();
  return {
    ...engine,
    signalStep: (input): ReturnType<Engine['signalStep']> => {
      counter.signalSteps += 1;
      return engine.signalStep(input);
    },
  };
}

async function referenceSnapshot(): Promise<string> {
  const reference = buildWalkForwardScenario();
  await runWalkForward(reference.params());
  return JSON.stringify(reference.memory.snapshot());
}

describe('walk-forward: retomada', () => {
  test(
    'queda no meio da BUSCA: a órfã `running` continua do checkpoint, sem refazer combinações, com resultado idêntico',
    async () => {
      const reference = await referenceSnapshot();
      const crashed = buildWalkForwardScenario({
        hooks: { failAtCommit: 6, isFailureUnrecordable: true },
      });
      const first = await runWalkForward(crashed.params());
      expect(first.status).toBe('failed');
      expect(crashed.memory.state.status).toBe('running');
      expect(crashed.memory.state.windows.size).toBe(0);
      const evaluated = crashed.memory.state.checkpoint?.progress ?? 0;
      expect(evaluated).toBeGreaterThan(0);
      const counter = { signalSteps: 0 };
      const resumed = await runWalkForward(crashed.params({ engine: countingEngine(counter) }));
      expect(resumed.status).toBe('completed');
      expect(JSON.stringify(crashed.memory.snapshot())).toBe(reference);
      const full = { signalSteps: 0 };
      const control = buildWalkForwardScenario();
      await runWalkForward(control.params({ engine: countingEngine(full) }));
      expect(counter.signalSteps).toBeLessThan(full.signalSteps);
    },
    TIMEOUT_MILLISECONDS,
  );

  test(
    'queda no meio do TESTE: a janela concluída não é refeita e o resultado é idêntico',
    async () => {
      const reference = await referenceSnapshot();
      // 12 gravações de busca (uma por combinação) e a 15ª é a segunda janela de teste.
      const crashed = buildWalkForwardScenario({
        hooks: { failAtCommit: COMBINATIONS + 2, isFailureUnrecordable: true },
      });
      await runWalkForward(crashed.params());
      expect(crashed.memory.state.status).toBe('running');
      expect(crashed.memory.state.windows.size).toBe(1);
      const storedFirst = JSON.stringify(crashed.memory.state.windows.get(0));
      const commitsBefore = crashed.memory.state.commits;
      const resumed = await runWalkForward(crashed.params());
      expect(resumed.status).toBe('completed');
      expect(JSON.stringify(crashed.memory.state.windows.get(0))).toBe(storedFirst);
      // só as três janelas que faltavam gravaram (e nenhuma combinação foi reavaliada)
      expect(crashed.memory.state.commits - commitsBefore).toBe(WINDOWS - 1);
      expect(JSON.stringify(crashed.memory.snapshot())).toBe(reference);
    },
    TIMEOUT_MILLISECONDS,
  );

  test(
    'uma execução concluída não é retomada nem refeita',
    async () => {
      const done = buildWalkForwardScenario();
      await runWalkForward(done.params());
      const again = await runWalkForward(done.params());
      expect(again.status).toBe('failed');
      expect(again.status === 'failed' && again.errorCode).toBe('RUN_NOT_RUNNABLE');
    },
    TIMEOUT_MILLISECONDS,
  );
});

describe('walk-forward: cancelamento', () => {
  test(
    'cancelado entre as janelas: para sem gravar a seguinte, mantém as anteriores e não é erro',
    async () => {
      const scenario = buildWalkForwardScenario({
        hooks: {
          afterCommit: (commit, controls) => {
            if (commit === COMBINATIONS + 1) controls.cancel();
          },
        },
      });
      const outcome = await runWalkForward(scenario.params());
      expect(outcome.status).toBe('cancelled');
      expect(outcome.status === 'cancelled' && outcome.completedWindows).toBe(1);
      expect(scenario.memory.state.status).toBe('cancelled');
      expect(scenario.memory.state.windows.size).toBe(1);
      expect(scenario.memory.state.errorCode).toBeUndefined();
      expect(scenario.memory.state.completedCalls).toBe(0);
    },
    TIMEOUT_MILLISECONDS,
  );

  test(
    'cancelado no meio da busca: nenhuma combinação nova começa depois do cancelamento',
    async () => {
      const counter = { signalSteps: 0 };
      const scenario = buildWalkForwardScenario({
        hooks: {
          afterCommit: (commit, controls) => {
            if (commit === 2) controls.cancel();
          },
        },
      });
      const outcome = await runWalkForward(scenario.params({ engine: countingEngine(counter) }));
      expect(outcome.status).toBe('cancelled');
      expect(scenario.memory.state.windows.size).toBe(0);
      expect(scenario.memory.state.commits).toBe(2);
    },
    TIMEOUT_MILLISECONDS,
  );

  test('uma execução já cancelada nem começa', async () => {
    const scenario = buildWalkForwardScenario();
    scenario.memory.state.status = 'cancelled';
    const outcome = await runWalkForward(scenario.params());
    expect(outcome.status).toBe('cancelled');
    expect(scenario.memory.calls.findCandles).toBe(0);
    expect(SCENARIO_GRID.parameters.length).toBe(3);
  });
});
