// Copyright (c) 2026 Ada Technology. All rights reserved.
import { expect } from 'bun:test';

import type { CreateEngine } from '../../../packages/strategy-engine/src/index.js';
import {
  checkCashNonNegative,
  checkDeterminism,
  checkImmutability,
  checkRestepIdempotent,
  checkSerialization,
  checkStepComposition,
  checkTiming,
} from './engine-contract-checks.fixture.js';
import { runSteps } from './engine-contract-runs.fixture.js';
import {
  ENGINE_CONTRACT_CHECK,
  EngineContractViolation,
  type ContractCheck,
  type EngineContractCheck,
  type EngineRun,
  type EngineScenario,
} from './engine-contract-types.fixture.js';
import {
  checkBatches,
  checkInputGuards,
  checkNoLookahead,
  checkResume,
} from './engine-continuity-checks.fixture.js';
import { checkRequiredEvents } from './engine-events.fixture.js';
import {
  checkFeesAndSlippage,
  checkGapBeyondStop,
  checkProtectivePrices,
  checkRealizedRisk,
  checkSinglePosition,
  checkStopBeforeTarget,
} from './engine-fill-checks.fixture.js';
import { checkGapPolicy } from './engine-gap-checks.fixture.js';
import { checkLimitOrders } from './engine-order-checks.fixture.js';
import { checkSignalPolicy } from './engine-policy-checks.fixture.js';

// Ordem importa: determinismo primeiro (qualquer comparação entre execuções acusaria um motor que lê o
// relógio pelo motivo errado); caixa antes da serialização (o schema também recusa caixa negativo);
// carimbo e futuro antes da composição (motor que carimba no passado quebra a guarda da carteira).
export const ENGINE_CONTRACT_CHECKS: readonly (readonly [EngineContractCheck, ContractCheck])[] = [
  [ENGINE_CONTRACT_CHECK.DETERMINISM, checkDeterminism],
  [ENGINE_CONTRACT_CHECK.IMMUTABILITY, checkImmutability],
  [ENGINE_CONTRACT_CHECK.RESTEP_IDEMPOTENT, checkRestepIdempotent],
  [ENGINE_CONTRACT_CHECK.CASH_NON_NEGATIVE, checkCashNonNegative],
  [ENGINE_CONTRACT_CHECK.SERIALIZATION, checkSerialization],
  [ENGINE_CONTRACT_CHECK.TIMING, checkTiming],
  [ENGINE_CONTRACT_CHECK.NO_LOOKAHEAD, checkNoLookahead],
  [ENGINE_CONTRACT_CHECK.STEP_COMPOSITION, checkStepComposition],
  [ENGINE_CONTRACT_CHECK.RESUME, checkResume],
  [ENGINE_CONTRACT_CHECK.BATCHES, checkBatches],
  [ENGINE_CONTRACT_CHECK.INPUT_GUARDS, checkInputGuards],
  [ENGINE_CONTRACT_CHECK.SINGLE_POSITION, checkSinglePosition],
  [ENGINE_CONTRACT_CHECK.PROTECTIVE_PRICES, checkProtectivePrices],
  [ENGINE_CONTRACT_CHECK.REALIZED_RISK, checkRealizedRisk],
  [ENGINE_CONTRACT_CHECK.FEES_AND_SLIPPAGE, checkFeesAndSlippage],
  [ENGINE_CONTRACT_CHECK.STOP_BEFORE_TARGET, checkStopBeforeTarget],
  [ENGINE_CONTRACT_CHECK.GAP_BEYOND_STOP, checkGapBeyondStop],
  [ENGINE_CONTRACT_CHECK.LIMIT_ORDERS, checkLimitOrders],
  [ENGINE_CONTRACT_CHECK.SIGNAL_POLICY, checkSignalPolicy],
  [ENGINE_CONTRACT_CHECK.GAP_POLICY, checkGapPolicy],
  [ENGINE_CONTRACT_CHECK.REQUIRED_EVENTS, checkRequiredEvents],
];

export type EngineContractParams = {
  readonly createEngine: CreateEngine;
  readonly scenarios: readonly EngineScenario[];
};

function guard<TValue>(
  check: EngineContractCheck,
  scenarioName: string,
  run: () => TValue,
): TValue {
  try {
    return run();
  } catch (error) {
    if (error instanceof EngineContractViolation) throw error;
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw new EngineContractViolation({ check, scenarioName, detail });
  }
}

function runBaseline(createEngine: CreateEngine, scenario: EngineScenario): EngineRun {
  return guard(ENGINE_CONTRACT_CHECK.COMPLETES, scenario.name, () =>
    runSteps({ engine: createEngine(), scenario }),
  );
}

export function runEngineCheck(params: {
  readonly createEngine: CreateEngine;
  readonly scenario: EngineScenario;
  readonly check: EngineContractCheck;
}): void {
  const { createEngine, scenario } = params;
  const entry = ENGINE_CONTRACT_CHECKS.find(([name]) => name === params.check);
  if (entry === undefined) throw new Error(`Verificação desconhecida: ${params.check}.`);
  const baseline = runBaseline(createEngine, scenario);
  guard(params.check, scenario.name, () => entry[1]({ createEngine, scenario, baseline }));
}

// Contrato que todo motor (referência, T2.2–T2.5, motor completo) precisa passar, cenário a cenário.
export function runEngineContract(params: EngineContractParams): void {
  expect(params.scenarios.length).toBeGreaterThan(0);
  for (const scenario of params.scenarios) {
    expect(scenario.candles.length).toBeGreaterThan(3);
    const baseline = runBaseline(params.createEngine, scenario);
    const context = { createEngine: params.createEngine, scenario, baseline };
    for (const [check, verify] of ENGINE_CONTRACT_CHECKS) {
      guard(check, scenario.name, () => verify(context));
    }
  }
}

export {
  ENGINE_CONTRACT_CHECK,
  ENGINE_EVENT_KIND,
  EngineContractViolation,
  type EngineContractCheck,
  type EngineEventKind,
  type EngineScenario,
} from './engine-contract-types.fixture.js';
