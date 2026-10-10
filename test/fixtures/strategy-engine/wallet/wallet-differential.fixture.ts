// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  EngineCandle,
  FillModelInput,
  FillModelResult,
  WalletState,
  WalletStepInput,
  WalletStepResult,
} from '../../../../packages/strategy-engine/src/index.js';
import { REFERENCE_ENGINE_DEFECT } from '../reference-engine-defect.fixture.js';
import { evaluateProtectiveExits, executePendingOrder } from '../reference-fills.fixture.js';
import type { WalletContext, WalletDraft } from '../reference-orders.fixture.js';
import { runReferenceWalletStep } from '../reference-wallet.fixture.js';
import {
  buildWalletFlow,
  initialWalletOf,
  WALLET_FLOW_COUNT,
  type FlowStep,
  type WalletFlow,
} from './wallet-flow.fixture.js';

export type WalletImplementation = (input: WalletStepInput) => WalletStepResult;
export type FillImplementation = (input: FillModelInput) => FillModelResult;

export type RecordedWalletStep = {
  readonly flow: WalletFlow;
  readonly index: number;
  readonly step: FlowStep;
  readonly before: WalletState;
  readonly result: WalletStepResult;
};

export const REFERENCE_WALLET: WalletImplementation = (input) =>
  runReferenceWalletStep(input, REFERENCE_ENGINE_DEFECT.NONE);

export function buildStepInput(
  flow: WalletFlow,
  step: FlowStep,
  state: WalletState,
): WalletStepInput {
  return {
    strategy: flow.strategy,
    run: flow.run,
    state,
    candle: step.candle,
    signal: step.signal,
    commands: step.commands,
  };
}

// O fluxo inteiro por UMA implementação; o estado de um passo é o resultado do anterior.
export function runWalletFlow(
  flow: WalletFlow,
  implementation: WalletImplementation,
): RecordedWalletStep[] {
  const recorded: RecordedWalletStep[] = [];
  let state = initialWalletOf(flow);
  flow.steps.forEach((step, index) => {
    const result = implementation(buildStepInput(flow, step, state));
    recorded.push({ flow, index, step, before: state, result });
    state = result.state;
  });
  return recorded;
}

// A parte de preenchimento da REFERÊNCIA (ordem pendente na abertura e stop/alvo), isolada do resto.
export const REFERENCE_FILL_MODEL: FillImplementation = (input) => {
  const draft: WalletDraft = {
    state: input.state,
    commands: [],
    orders: [],
    fills: [],
    openedPositions: [],
    closedPositions: [],
    isIntraCandleEntry: false,
  };
  const context: WalletContext = {
    config: input.strategy.config,
    run: input.run.parameters,
    candle: input.candle,
    defect: REFERENCE_ENGINE_DEFECT.NONE,
  };
  executePendingOrder(draft, context);
  evaluateProtectiveExits(draft, context);
  const { state, orders, fills, openedPositions, closedPositions } = draft;
  return { state, orders, fills, openedPositions, closedPositions };
};

export type Divergence = {
  readonly flowIndex: number;
  readonly stepIndex: number;
  readonly production: string;
  readonly reference: string;
};

export type DifferentialReport = {
  readonly flows: number;
  readonly steps: number;
  readonly divergences: readonly Divergence[];
};

export function* iterateFlows(count: number = WALLET_FLOW_COUNT): Generator<WalletFlow> {
  for (let index = 0; index < count; index += 1) yield buildWalletFlow(index);
}

export function candleOf(recorded: RecordedWalletStep): EngineCandle {
  return recorded.step.candle;
}

// Estado e decisões IGUAIS byte a byte: compara o JSON do resultado inteiro de cada passo. Com
// `shouldStopAtFirst` para na primeira divergência (o juiz de mutantes só precisa de uma).
export function compareWalletImplementations(params: {
  readonly production: WalletImplementation;
  readonly reference: WalletImplementation;
  readonly count?: number;
  readonly shouldStopAtFirst?: boolean;
}): DifferentialReport {
  const divergences: Divergence[] = [];
  let flows = 0;
  let steps = 0;
  for (const flow of iterateFlows(params.count)) {
    flows += 1;
    const reference = runWalletFlow(flow, params.reference);
    const production = runWalletFlow(flow, params.production);
    steps += reference.length;
    reference.forEach((recorded, stepIndex) => {
      const expected = JSON.stringify(recorded.result);
      const received = JSON.stringify(production[stepIndex]?.result);
      if (expected === received) return;
      divergences.push({
        flowIndex: flow.index,
        stepIndex,
        production: received,
        reference: expected,
      });
    });
    if (params.shouldStopAtFirst === true && divergences.length > 0) break;
  }
  return { flows, steps, divergences };
}

// O FillModel de produção contra o da referência, no estado ANTERIOR a cada passo da referência.
export function compareFillModels(params: {
  readonly production: FillImplementation;
  readonly count?: number;
}): DifferentialReport {
  const divergences: Divergence[] = [];
  let flows = 0;
  let steps = 0;
  for (const flow of iterateFlows(params.count)) {
    flows += 1;
    for (const recorded of runWalletFlow(flow, REFERENCE_WALLET)) {
      steps += 1;
      const input: FillModelInput = {
        strategy: flow.strategy,
        run: flow.run,
        state: recorded.before,
        candle: recorded.step.candle,
        executionReports: [],
      };
      const expected = JSON.stringify(REFERENCE_FILL_MODEL(input));
      const received = JSON.stringify(params.production(input));
      if (expected === received) continue;
      divergences.push({
        flowIndex: flow.index,
        stepIndex: recorded.index,
        production: received,
        reference: expected,
      });
    }
  }
  return { flows, steps, divergences };
}
