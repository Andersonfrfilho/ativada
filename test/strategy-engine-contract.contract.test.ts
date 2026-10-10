// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  ENGINE_CONTRACT_CHECK,
  ENGINE_EVENT_KIND,
  EngineContractViolation,
  runEngineCheck,
  runEngineContract,
  type EngineContractCheck,
} from './fixtures/strategy-engine/engine-contract.fixture.js';
import { runSteps } from './fixtures/strategy-engine/engine-contract-runs.fixture.js';
import type { RecordedStep } from './fixtures/strategy-engine/engine-contract-types.fixture.js';
import {
  buildCandles,
  buildReferenceScenarios,
  buildReferenceStrategy,
  LIMIT_SCENARIO_PRICES,
  MARKET_SCENARIO_PRICES,
} from './fixtures/strategy-engine/engine-scenarios.fixture.js';
import { createReferenceEngine } from './fixtures/strategy-engine/reference-engine.fixture.js';
import {
  REFERENCE_ENGINE_DEFECT,
  type ReferenceEngineDefect,
} from './fixtures/strategy-engine/reference-engine-defect.fixture.js';

function captureFailure(run: () => void): unknown {
  try {
    run();
    return undefined;
  } catch (error) {
    return error;
  }
}

function runReference(prices: typeof MARKET_SCENARIO_PRICES, isLimit: boolean): RecordedStep[] {
  const strategy = buildReferenceStrategy(
    isLimit
      ? { orderType: 'limit', offsetRate: '0.01', expiryCandles: 2 }
      : { orderType: 'market' },
  );
  return runSteps({ engine: createReferenceEngine(), strategy, candles: buildCandles(prices) });
}

const DEFECTS_AND_FAILING_CHECKS: readonly (readonly [
  ReferenceEngineDefect,
  EngineContractCheck,
])[] = [
  [REFERENCE_ENGINE_DEFECT.READS_CLOCK, ENGINE_CONTRACT_CHECK.DETERMINISM],
  [REFERENCE_ENGINE_DEFECT.MUTATES_INPUT_STATE, ENGINE_CONTRACT_CHECK.IMMUTABILITY],
  [REFERENCE_ENGINE_DEFECT.NON_SERIALIZABLE_STATE, ENGINE_CONTRACT_CHECK.SERIALIZATION],
  [REFERENCE_ENGINE_DEFECT.LOOKS_AT_FUTURE, ENGINE_CONTRACT_CHECK.TIMING],
  [REFERENCE_ENGINE_DEFECT.FILLS_AT_DECISION_CLOSE, ENGINE_CONTRACT_CHECK.TIMING],
  [REFERENCE_ENGINE_DEFECT.HIDDEN_STATE, ENGINE_CONTRACT_CHECK.RESUME],
  [REFERENCE_ENGINE_DEFECT.ALLOWS_SECOND_POSITION, ENGINE_CONTRACT_CHECK.SINGLE_POSITION],
  [REFERENCE_ENGINE_DEFECT.IGNORES_FEE, ENGINE_CONTRACT_CHECK.FEES_AND_SLIPPAGE],
  [REFERENCE_ENGINE_DEFECT.IGNORES_SLIPPAGE, ENGINE_CONTRACT_CHECK.FEES_AND_SLIPPAGE],
  [REFERENCE_ENGINE_DEFECT.TARGET_BEFORE_STOP, ENGINE_CONTRACT_CHECK.STOP_BEFORE_TARGET],
  [REFERENCE_ENGINE_DEFECT.STOP_PRICE_ON_GAP, ENGINE_CONTRACT_CHECK.GAP_BEYOND_STOP],
  [REFERENCE_ENGINE_DEFECT.LIMIT_NEVER_EXPIRES, ENGINE_CONTRACT_CHECK.LIMIT_ORDERS],
];

describe('strategy engine contract harness', () => {
  test('the reference engine passes every check on every scenario', () => {
    runEngineContract({
      createEngine: () => createReferenceEngine(),
      scenarios: buildReferenceScenarios(),
    });
  });

  test('the market scenario fills at the next open with slippage and resolves stop, gap and target', () => {
    const run = runReference(MARKET_SCENARIO_PRICES, false);
    const fills = run.flatMap((step) => step.result.decisions.fills);
    const closed = run.flatMap((step) => step.result.decisions.closedPositions);
    expect(fills[0]).toMatchObject({ price: '100.05', quantity: '24.9875', fee: '2.49999938' });
    expect(closed.map((position) => [position.exitReason, position.exitPrice])).toStrictEqual([
      ['stop', '96'],
      ['stop', '84.95'],
      ['target', '115.05'],
    ]);
    expect(run[8]?.result.decisions.signal?.action).toBe('BUY');
    expect(run[7]?.result.decisions.signal).toBeNull();
  });

  test('the limit scenario expires, fills inside the candle and fills at a gap open', () => {
    const run = runReference(LIMIT_SCENARIO_PRICES, true);
    const statuses = run.map((step) => step.result.decisions.orders.map((order) => order.status));
    expect(statuses[10]).toStrictEqual(['expired', 'created']);
    const buyPrices = run.flatMap((step) =>
      step.result.decisions.fills.filter((fill) => fill.side === 'buy').map((fill) => fill.price),
    );
    expect(buyPrices).toStrictEqual(['99', '101.06']);
  });

  test('the benchmark buys at the first open after the lead-in and is marked to liquidation', () => {
    const run = runReference(MARKET_SCENARIO_PRICES, false);
    expect(run[8]?.result.decisions.equityPoint).toMatchObject({
      equity: '10000',
      benchmark: '10000',
    });
    expect(run[9]?.result.state.benchmark).toStrictEqual({
      quantity: '99.85017',
      cash: '0.00048199',
    });
  });

  test.each(DEFECTS_AND_FAILING_CHECKS)(
    'the harness fails the engine whose defect is %s at the %s check',
    (defect, expectedCheck) => {
      const failure = captureFailure(() =>
        runEngineContract({
          createEngine: () => createReferenceEngine(defect),
          scenarios: buildReferenceScenarios(),
        }),
      );
      expect(failure).toBeInstanceOf(EngineContractViolation);
      expect((failure as EngineContractViolation).check).toBe(expectedCheck);
    },
  );

  test('the future-mutation check alone also fails the engine that looks at the future', () => {
    const [scenario] = buildReferenceScenarios();
    if (scenario === undefined) throw new Error('Cenário ausente.');
    const failure = captureFailure(() =>
      runEngineCheck({
        createEngine: () => createReferenceEngine(REFERENCE_ENGINE_DEFECT.LOOKS_AT_FUTURE),
        scenario,
        check: ENGINE_CONTRACT_CHECK.NO_LOOKAHEAD,
      }),
    );
    expect((failure as EngineContractViolation).check).toBe(ENGINE_CONTRACT_CHECK.NO_LOOKAHEAD);
  });

  test('a scenario that does not trigger the events it promises fails instead of passing', () => {
    const [scenario] = buildReferenceScenarios();
    if (scenario === undefined) throw new Error('Cenário ausente.');
    const failure = captureFailure(() =>
      runEngineContract({
        createEngine: () => createReferenceEngine(),
        scenarios: [
          {
            ...scenario,
            candles: scenario.candles.slice(0, 11),
            requiredEvents: [ENGINE_EVENT_KIND.STOP_EXIT_ON_GAP],
          },
        ],
      }),
    );
    expect((failure as EngineContractViolation).check).toBe(ENGINE_CONTRACT_CHECK.REQUIRED_EVENTS);
  });
});
