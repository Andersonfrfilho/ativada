// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  createEngine,
  ENGINE_INPUT_ERROR_CODE,
  type RunSetup,
  type StepInput,
  type StrategyVersion,
} from '../packages/strategy-engine/src/index.js';
import { buildStepInput } from './fixtures/strategy-engine/engine-contract-runs.fixture.js';
import { buildProductionScenarios } from './fixtures/strategy-engine/production/production-scenarios.fixture.js';
import { countEnumerationsAfterEachCall } from './fixtures/strategy-engine/production/hash-probe.fixture.js';
import {
  guardInput,
  GUARD_RUN,
  GUARD_STRATEGY,
} from './fixtures/strategy-engine/production/wallet-guard-cases.fixture.js';

// O hash é conferido pelo motor, não confiado: mexer no conteúdo mantendo o rótulo é recusado.
function required<TValue>(value: TValue | undefined): TValue {
  if (value === undefined) throw new Error('Valor ausente.');
  return value;
}

const SCENARIO = required(buildProductionScenarios()[0]);
const FIRST_CANDLE = required(SCENARIO.candles[0]);

function stepInputWith(overrides: Partial<StepInput>): StepInput {
  const state = createEngine().createInitialState({
    strategy: SCENARIO.strategy,
    run: SCENARIO.run,
  });
  const base = buildStepInput({
    scenario: SCENARIO,
    state,
    candle: FIRST_CANDLE,
    sentiment: [],
  });
  return { ...base, ...overrides };
}

function withFee(run: RunSetup, feeRate: string): RunSetup {
  return { ...run, parameters: { ...run.parameters, feeRate } };
}

function withRisk(strategy: StrategyVersion, riskPerTrade: string): StrategyVersion {
  const { config } = strategy;
  return { ...strategy, config: { ...config, risk: { ...config.risk, riskPerTrade } } };
}

describe('the engine recomputes the hashes instead of trusting the labels', () => {
  test('step: the same runHash over other parameters is refused', () => {
    const input = stepInputWith({});
    const tampered = { ...input, run: withFee(input.run, '0.002') };
    expect(() => createEngine().step(tampered)).toThrow(
      expect.objectContaining({ code: ENGINE_INPUT_ERROR_CODE.RUN_HASH_MISMATCH }),
    );
  });

  test('step: the same configHash over another configuration is refused', () => {
    const input = stepInputWith({});
    const tampered = { ...input, strategy: withRisk(input.strategy, '0.02') };
    expect(() => createEngine().step(tampered)).toThrow(
      expect.objectContaining({ code: ENGINE_INPUT_ERROR_CODE.CONFIG_HASH_MISMATCH }),
    );
  });

  test('walletStep: the standalone wallet recomputes both hashes too', () => {
    const base = guardInput();
    expect(() => createEngine().walletStep({ ...base, run: withFee(GUARD_RUN, '0.002') })).toThrow(
      expect.objectContaining({ code: ENGINE_INPUT_ERROR_CODE.RUN_HASH_MISMATCH }),
    );
    expect(() =>
      createEngine().walletStep({ ...base, strategy: withRisk(GUARD_STRATEGY, '0.02') }),
    ).toThrow(expect.objectContaining({ code: ENGINE_INPUT_ERROR_CODE.CONFIG_HASH_MISMATCH }));
  });

  test('the same untouched objects are hashed once, not at every step', () => {
    const counts = countEnumerationsAfterEachCall(createEngine().walletStep, 5);
    expect(counts[0]).toBeGreaterThan(0);
    expect(new Set(counts).size).toBe(1);
  });
});
