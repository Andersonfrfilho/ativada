// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  ENGINE_CONTRACT_CHECK,
  ENGINE_EVENT_KIND,
  EngineContractViolation,
  runEngineCheck,
  runEngineContract,
  type EngineContractCheck,
  type EngineScenario,
} from './fixtures/strategy-engine/engine-contract.fixture.js';
import { createReferenceEngine } from './fixtures/strategy-engine/reference-engine.fixture.js';
import {
  REFERENCE_ENGINE_DEFECT,
  type ReferenceEngineDefect,
} from './fixtures/strategy-engine/reference-engine-defect.fixture.js';
import { buildReferenceScenarios } from './fixtures/strategy-engine/reference-scenarios.fixture.js';

function captureFailure(run: () => void): EngineContractViolation {
  try {
    run();
  } catch (error) {
    if (error instanceof EngineContractViolation) return error;
    throw error;
  }
  throw new Error('O harness deveria ter reprovado o motor.');
}

function scenarioNamed(name: string): EngineScenario {
  const found = buildReferenceScenarios().find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`Cenário ${name} ausente.`);
  return found;
}

// Cada motor quebrado de propósito é reprovado PELA verificação certa (a primeira que falha).
const DEFECTS_AND_FAILING_CHECKS: readonly (readonly [
  ReferenceEngineDefect,
  EngineContractCheck,
])[] = [
  [REFERENCE_ENGINE_DEFECT.READS_CLOCK, ENGINE_CONTRACT_CHECK.DETERMINISM],
  [REFERENCE_ENGINE_DEFECT.MUTATES_INPUT_STATE, ENGINE_CONTRACT_CHECK.IMMUTABILITY],
  [REFERENCE_ENGINE_DEFECT.RESTEP_NOT_IDEMPOTENT, ENGINE_CONTRACT_CHECK.RESTEP_IDEMPOTENT],
  [REFERENCE_ENGINE_DEFECT.OVERSPENDS_CASH, ENGINE_CONTRACT_CHECK.CASH_NON_NEGATIVE],
  [REFERENCE_ENGINE_DEFECT.NON_SERIALIZABLE_STATE, ENGINE_CONTRACT_CHECK.SERIALIZATION],
  [REFERENCE_ENGINE_DEFECT.LOOKS_AT_FUTURE, ENGINE_CONTRACT_CHECK.TIMING],
  [REFERENCE_ENGINE_DEFECT.SENTIMENT_LOOKAHEAD, ENGINE_CONTRACT_CHECK.TIMING],
  [REFERENCE_ENGINE_DEFECT.FILLS_AT_DECISION_CLOSE, ENGINE_CONTRACT_CHECK.TIMING],
  [REFERENCE_ENGINE_DEFECT.SPLIT_DIVERGES, ENGINE_CONTRACT_CHECK.STEP_COMPOSITION],
  [REFERENCE_ENGINE_DEFECT.HIDDEN_STATE, ENGINE_CONTRACT_CHECK.RESUME],
  [REFERENCE_ENGINE_DEFECT.ZERO_PRICE_ACCEPTED, ENGINE_CONTRACT_CHECK.INPUT_GUARDS],
  [REFERENCE_ENGINE_DEFECT.ALLOWS_SECOND_POSITION, ENGINE_CONTRACT_CHECK.SINGLE_POSITION],
  [REFERENCE_ENGINE_DEFECT.STOP_FROM_DECISION_CLOSE, ENGINE_CONTRACT_CHECK.PROTECTIVE_PRICES],
  [REFERENCE_ENGINE_DEFECT.SIZE_AT_DECISION, ENGINE_CONTRACT_CHECK.REALIZED_RISK],
  [REFERENCE_ENGINE_DEFECT.IGNORES_FEES_IN_SIZE, ENGINE_CONTRACT_CHECK.REALIZED_RISK],
  [REFERENCE_ENGINE_DEFECT.VOLUME_OF_FILL_CANDLE, ENGINE_CONTRACT_CHECK.REALIZED_RISK],
  [REFERENCE_ENGINE_DEFECT.IGNORES_FEE, ENGINE_CONTRACT_CHECK.FEES_AND_SLIPPAGE],
  [REFERENCE_ENGINE_DEFECT.IGNORES_SLIPPAGE, ENGINE_CONTRACT_CHECK.FEES_AND_SLIPPAGE],
  [REFERENCE_ENGINE_DEFECT.TARGET_BEFORE_STOP, ENGINE_CONTRACT_CHECK.STOP_BEFORE_TARGET],
  [REFERENCE_ENGINE_DEFECT.TARGET_ON_TOUCH, ENGINE_CONTRACT_CHECK.STOP_BEFORE_TARGET],
  [REFERENCE_ENGINE_DEFECT.INTRA_CANDLE_LIMIT_TARGET, ENGINE_CONTRACT_CHECK.STOP_BEFORE_TARGET],
  [REFERENCE_ENGINE_DEFECT.STOP_PRICE_ON_GAP, ENGINE_CONTRACT_CHECK.GAP_BEYOND_STOP],
  [REFERENCE_ENGINE_DEFECT.GAP_TARGET_AT_OPEN, ENGINE_CONTRACT_CHECK.GAP_BEYOND_STOP],
  [REFERENCE_ENGINE_DEFECT.LIMIT_NEVER_EXPIRES, ENGINE_CONTRACT_CHECK.LIMIT_ORDERS],
  [REFERENCE_ENGINE_DEFECT.LIMIT_EXPIRES_OFF_BY_ONE, ENGINE_CONTRACT_CHECK.LIMIT_ORDERS],
  [REFERENCE_ENGINE_DEFECT.LIMIT_FILLS_ON_TOUCH, ENGINE_CONTRACT_CHECK.LIMIT_ORDERS],
  [REFERENCE_ENGINE_DEFECT.IGNORES_OPPOSITE_SIGNAL, ENGINE_CONTRACT_CHECK.SIGNAL_POLICY],
];

describe('strategy engine contract harness', () => {
  test('the reference engine passes every check on every scenario', () => {
    runEngineContract({
      createEngine: () => createReferenceEngine(),
      scenarios: buildReferenceScenarios(),
    });
  });

  test('every defect of the catalogue is covered by the table below', () => {
    const covered = new Set(DEFECTS_AND_FAILING_CHECKS.map(([defect]) => defect));
    const uncovered = Object.values(REFERENCE_ENGINE_DEFECT).filter(
      (defect) => defect !== REFERENCE_ENGINE_DEFECT.NONE && !covered.has(defect),
    );
    expect(uncovered).toStrictEqual([]);
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
      expect(failure.check).toBe(expectedCheck);
    },
  );

  test('the future-mutation check alone also fails the engine that looks at future prices', () => {
    const failure = captureFailure(() =>
      runEngineCheck({
        createEngine: () => createReferenceEngine(REFERENCE_ENGINE_DEFECT.LOOKS_AT_FUTURE),
        scenario: scenarioNamed('market-entries-with-stop-gap-and-target'),
        check: ENGINE_CONTRACT_CHECK.NO_LOOKAHEAD,
      }),
    );
    expect(failure.check).toBe(ENGINE_CONTRACT_CHECK.NO_LOOKAHEAD);
  });

  test('only the future-sentiment perturbation catches the engine that reads sentiment ahead', () => {
    const failure = captureFailure(() =>
      runEngineCheck({
        createEngine: () => createReferenceEngine(REFERENCE_ENGINE_DEFECT.SENTIMENT_LOOKAHEAD),
        scenario: scenarioNamed('sell-paths-commands-and-sentiment'),
        check: ENGINE_CONTRACT_CHECK.NO_LOOKAHEAD,
      }),
    );
    expect(failure.check).toBe(ENGINE_CONTRACT_CHECK.NO_LOOKAHEAD);
    expect(failure.message).toContain('o sentimento futuro');
  });

  test('a scenario that does not trigger the events it promises fails instead of passing', () => {
    const scenario = scenarioNamed('market-entries-with-stop-gap-and-target');
    const failure = captureFailure(() =>
      runEngineContract({
        createEngine: () => createReferenceEngine(),
        scenarios: [
          {
            ...scenario,
            candles: scenario.candles.slice(0, 5),
            requiredEvents: [ENGINE_EVENT_KIND.STOP_EXIT_ON_GAP],
          },
        ],
      }),
    );
    expect(failure.check).toBe(ENGINE_CONTRACT_CHECK.REQUIRED_EVENTS);
  });
});
