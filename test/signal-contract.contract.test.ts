// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { buildReferenceRun } from './fixtures/strategy-engine/engine-scenarios.fixture.js';
import {
  ENGINE_CONTRACT_CHECK,
  runEngineCheck,
  type EngineContractCheck,
  type EngineScenario,
} from './fixtures/strategy-engine/engine-contract.fixture.js';
import {
  CLASSIC_STRATEGY,
  REAL_DATASETS,
} from './fixtures/strategy-engine/signal/classic-signals.fixture.js';
import { createProductionSignalProbeEngine } from './fixtures/strategy-engine/signal/composed-engine.fixture.js';
import { PRODUCTION_SIGNAL_API } from './fixtures/strategy-engine/signal/signal-api.fixture.js';
import { buildSignalScenarios } from './fixtures/strategy-engine/signal/signal-contract-scenarios.fixture.js';
import {
  runSignal,
  runSignalContract,
  SIGNAL_CONTRACT_CHECKS,
} from './fixtures/strategy-engine/signal/signal-contract.fixture.js';

const SIGNAL_SCENARIOS = buildSignalScenarios();
const PROBE_CANDLES = 230;

describe('signal contract: the production signalStep (no wallet)', () => {
  test('passes every check on every scenario', () => {
    runSignalContract({ api: PRODUCTION_SIGNAL_API, scenarios: SIGNAL_SCENARIOS });
  });

  test('the scenarios reach the decided phase and exercise both regimes and the sentiment', () => {
    const [first] = SIGNAL_SCENARIOS;
    if (first === undefined) throw new Error('Cenário ausente.');
    const signals = runSignal({ api: PRODUCTION_SIGNAL_API, scenario: first })
      .map((step) => step.result.signal)
      .filter((signal) => signal !== null);
    expect(signals.length).toBeGreaterThan(30);
    expect(new Set(signals.map((signal) => signal.regime))).toStrictEqual(
      new Set(['trending', 'ranging']),
    );
    expect(new Set(signals.map((signal) => signal.action))).toStrictEqual(
      new Set(['BUY', 'SELL', 'HOLD']),
    );
    const sentimentVotes = signals.map((signal) => signal.votes.at(-1)?.isMissing);
    expect(new Set(sentimentVotes)).toStrictEqual(new Set([true, false]));
    expect(SIGNAL_CONTRACT_CHECKS.map(([check]) => check)).toStrictEqual([
      'determinism',
      'immutability',
      'serialization',
      'timing',
      'no-lookahead',
      'resume',
      'batches',
    ]);
  });
});

function probeScenario(): EngineScenario {
  const dataset = REAL_DATASETS[0];
  if (dataset === undefined) throw new Error('Conjunto real ausente.');
  return {
    name: 'production signal on real BTCUSDT candles',
    strategy: CLASSIC_STRATEGY,
    run: buildReferenceRun(),
    candles: dataset.candles.slice(0, PROBE_CANDLES),
    sentiment: [],
    commands: {},
    requiredEvents: [],
  };
}

const COMPOSED_CHECKS: readonly EngineContractCheck[] = [
  ENGINE_CONTRACT_CHECK.DETERMINISM,
  ENGINE_CONTRACT_CHECK.IMMUTABILITY,
  ENGINE_CONTRACT_CHECK.SERIALIZATION,
  ENGINE_CONTRACT_CHECK.TIMING,
  ENGINE_CONTRACT_CHECK.STEP_COMPOSITION,
  ENGINE_CONTRACT_CHECK.INPUT_GUARDS,
];

describe('the production signalStep plugged into the composed step (reference wallet)', () => {
  test.each(COMPOSED_CHECKS.map((check) => [check] as const))(
    'passes the engine harness check %s',
    (check) => {
      runEngineCheck({
        createEngine: createProductionSignalProbeEngine,
        scenario: probeScenario(),
        check,
      });
    },
  );

  test('the composed run decides from the 194th candle and the reference wallet reacts to it', () => {
    const engine = createProductionSignalProbeEngine();
    const scenario = probeScenario();
    let state = engine.createInitialState({ strategy: scenario.strategy, run: scenario.run });
    const decided: number[] = [];
    for (const [index, candle] of scenario.candles.entries()) {
      const result = engine.step({ strategy: scenario.strategy, run: scenario.run, state, candle });
      if (result.decisions.signal !== null) decided.push(index);
      state = result.state;
    }
    expect(decided[0]).toBe(193);
    expect(decided).toHaveLength(PROBE_CANDLES - 193);
    expect(state.wallet.benchmark).not.toBeNull();
  });
});
