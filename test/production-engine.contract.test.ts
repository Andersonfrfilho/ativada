// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createEngine,
  ENGINE_INPUT_ERROR_CODE,
  ENGINE_STATE_ERROR_CODE,
  ENGINE_VERSION,
  EngineInputError,
  EngineStateError,
  type StepInput,
} from '../packages/strategy-engine/src/index.js';
import {
  buildStepInput,
  runSteps,
} from './fixtures/strategy-engine/engine-contract-runs.fixture.js';
import { runEngineContract } from './fixtures/strategy-engine/engine-contract.fixture.js';
import { buildProductionScenarios } from './fixtures/strategy-engine/production/production-scenarios.fixture.js';
import { createWalletProbeEngine } from './fixtures/strategy-engine/production/wallet-probe-engine.fixture.js';
import { buildReferenceScenarios } from './fixtures/strategy-engine/reference-scenarios.fixture.js';

const HARNESS_TIMEOUT_MILLISECONDS = 300_000;
const PRODUCTION_SCENARIOS = buildProductionScenarios();

function requireItem<TValue>(items: readonly TValue[], index: number): TValue {
  const item = items[index];
  if (item === undefined) throw new Error(`Item ${index} ausente.`);
  return item;
}

describe('the production engine (createEngine) against the engine contract harness', () => {
  test('is versioned and starts from a state bound to the strategy, the run and the engine', () => {
    const engine = createEngine();
    const scenario = requireItem(PRODUCTION_SCENARIOS, 0);
    const state = engine.createInitialState({ strategy: scenario.strategy, run: scenario.run });
    expect(engine.engineVersion).toBe(ENGINE_VERSION);
    expect(state.engineVersion).toBe(ENGINE_VERSION);
    expect(state.wallet.configHash).toBe(scenario.strategy.configHash);
    expect(state.wallet.runHash).toBe(scenario.run.runHash);
    expect(state.signal.leadInCandles).toBeGreaterThan(1);
  });

  test.each(PRODUCTION_SCENARIOS.map((scenario) => [scenario.name, scenario] as const))(
    'passes all 20 checks with the real scoreboard signal: %s',
    (_name, scenario) => {
      runEngineContract({ createEngine, scenarios: [scenario] });
    },
    HARNESS_TIMEOUT_MILLISECONDS,
  );

  test('the production wallet passes all 20 checks on the reference scenarios (reference signal)', () => {
    runEngineContract({
      createEngine: createWalletProbeEngine,
      scenarios: buildReferenceScenarios(),
    });
  });
});

describe('the production engine: the composed step and its two halves', () => {
  const scenario = requireItem(PRODUCTION_SCENARIOS, 0);

  function nextInput(): StepInput {
    const engine = createEngine();
    const steps = runSteps({ engine, scenario, candles: scenario.candles.slice(0, 5) });
    return buildStepInput({
      scenario,
      state: requireItem(steps, 4).result.state,
      candle: requireItem(scenario.candles, 5),
      sentiment: [],
    });
  }

  test('a step refuses a state written by another engine version', () => {
    const engine = createEngine();
    const input = nextInput();
    expect(() =>
      engine.step({ ...input, state: { ...input.state, engineVersion: 'engine-0' } }),
    ).toThrow(expect.objectContaining({ code: ENGINE_STATE_ERROR_CODE.ENGINE_MISMATCH }));
    expect(() =>
      engine.step({ ...input, state: { ...input.state, engineVersion: 'engine-0' } }),
    ).toThrow(EngineStateError);
  });

  test('a step refuses execution reports from the exchange, loudly', () => {
    const input = nextInput();
    const report = {
      kind: 'order_rejected',
      reportId: 'report-1',
      reportedAt: input.candle.openTime,
      orderKey: 'order-0',
    } as const;
    for (const attempt of [
      (): unknown => createEngine().step({ ...input, executionReports: [report] }),
      (): unknown =>
        createEngine().walletStep({
          strategy: input.strategy,
          run: input.run,
          state: input.state.wallet,
          candle: input.candle,
          signal: null,
          executionReports: [report],
        }),
    ]) {
      expect(attempt).toThrow(EngineInputError);
      expect(attempt).toThrow(
        expect.objectContaining({ code: ENGINE_INPUT_ERROR_CODE.EXECUTION_REPORTS_UNSUPPORTED }),
      );
    }
  });

  test('a confirmed gap crosses signal and wallet: the signal echoes it and the lone wallet needs it', () => {
    const engine = createEngine();
    const steps = runSteps({ engine, scenario, candles: scenario.candles.slice(0, 40) });
    const last = requireItem(steps, 39);
    const afterGap = requireItem(scenario.candles, 41);
    const input = {
      ...buildStepInput({ scenario, state: last.result.state, candle: afterGap, sentiment: [] }),
      confirmedGapCandles: 1,
    };
    const result = engine.step(input);
    expect(result.decisions.signal?.confirmedGapCandles).toBe(1);
    const wallet = {
      strategy: scenario.strategy,
      run: scenario.run,
      state: last.result.state.wallet,
      candle: afterGap,
      commands: [],
    };
    expect(engine.walletStep({ ...wallet, signal: result.decisions.signal }).state).toStrictEqual(
      result.state.wallet,
    );
    const withoutEcho =
      result.decisions.signal === null
        ? null
        : { ...result.decisions.signal, confirmedGapCandles: 0 };
    expect(() => engine.walletStep({ ...wallet, signal: withoutEcho })).toThrow(
      expect.objectContaining({ code: ENGINE_INPUT_ERROR_CODE.CANDLE_GAP_UNCONFIRMED }),
    );
  });
});
