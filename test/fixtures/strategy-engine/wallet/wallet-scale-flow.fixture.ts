// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  ENTRY_RISK_SCALE,
  EngineDecimal,
  toEngineDecimal,
  type EntryRiskScale,
  type WalletState,
  type WalletStepInput,
  type WalletStepResult,
} from '../../../../packages/strategy-engine/src/index.js';
import { createRandom } from '../risk/risk-grid.fixture.js';
import type { WalletImplementation } from './wallet-differential.fixture.js';
import { buildWalletFlow, initialWalletOf, type WalletFlow } from './wallet-flow.fixture.js';

// Teto da entrada por passo (ADR 0002 A21) sobre fluxos de carteira. Gerador SEPARADO: os fluxos são os do
// `buildWalletFlow` a partir de um índice longe dos 3.000 do diferencial (que seguem intactos) e a escala de
// cada passo sai de outro sorteio, com semente própria. Um passo em cinco vai sem escala (= '1').
export const SCALE_FLOW_SEED = 20_261_016;
export const SCALE_FLOW_COUNT = 1_500;
export const SCALE_FLOW_FIRST_INDEX = 100_000;
const SCALE_SEED_STRIDE = 6_151;
const ABSENT_SHARE_PERCENT = 20;
const PERCENT = 100;
const MONEY_STEP = new EngineDecimal('0.00000001');
// Escrita à mão (não lida do `src`): um mutante que alargue o conjunto não muda o gerador.
const SCALES: readonly EntryRiskScale[] = ['0', '0.25', '0.5', '1'];

export type ScaledFlow = {
  readonly flow: WalletFlow;
  readonly scales: readonly (EntryRiskScale | undefined)[];
};

export type ScaledStep = {
  readonly index: number;
  readonly input: WalletStepInput;
  readonly before: WalletState;
  readonly result: WalletStepResult;
};

export function buildScaledFlow(index: number): ScaledFlow {
  const flow = buildWalletFlow(SCALE_FLOW_FIRST_INDEX + index);
  const random = createRandom(SCALE_FLOW_SEED + index * SCALE_SEED_STRIDE);
  const scales = flow.steps.map((): EntryRiskScale | undefined => {
    if (random(PERCENT) < ABSENT_SHARE_PERCENT) return undefined;
    return SCALES[random(SCALES.length)];
  });
  return { flow, scales };
}

function inputOf(scaled: ScaledFlow, index: number, state: WalletState): WalletStepInput {
  const step = scaled.flow.steps[index];
  if (step === undefined) throw new Error('Passo ausente.');
  const scale = scaled.scales[index];
  return {
    strategy: scaled.flow.strategy,
    run: scaled.flow.run,
    state,
    candle: step.candle,
    signal: step.signal,
    commands: step.commands,
    ...(scale === undefined ? {} : { entryRiskScale: scale }),
  };
}

export function runScaledFlow(
  scaled: ScaledFlow,
  implementation: WalletImplementation,
): ScaledStep[] {
  const steps: ScaledStep[] = [];
  let state = initialWalletOf(scaled.flow);
  scaled.flow.steps.forEach((_step, index) => {
    const input = inputOf(scaled, index, state);
    const result = implementation(input);
    steps.push({ index, input, before: state, result });
    state = result.state;
  });
  return steps;
}

export type ScaleDivergence = { readonly flowIndex: number; readonly stepIndex: number };

// Estado e decisões IGUAIS byte a byte entre produção e referência, passo a passo, com a escala.
export function compareScaledWallets(params: {
  readonly production: WalletImplementation;
  readonly reference: WalletImplementation;
  readonly count?: number;
  readonly shouldStopAtFirst?: boolean;
}): { readonly steps: number; readonly divergences: readonly ScaleDivergence[] } {
  const divergences: ScaleDivergence[] = [];
  let steps = 0;
  for (let flowIndex = 0; flowIndex < (params.count ?? SCALE_FLOW_COUNT); flowIndex += 1) {
    const scaled = buildScaledFlow(flowIndex);
    const expected = runScaledFlow(scaled, params.reference);
    const received = runScaledFlow(scaled, params.production);
    steps += expected.length;
    const stepIndex = expected.findIndex(
      (step, index) => JSON.stringify(step.result) !== JSON.stringify(received[index]?.result),
    );
    if (stepIndex >= 0) divergences.push({ flowIndex, stepIndex });
    if (params.shouldStopAtFirst === true && divergences.length > 0) break;
  }
  return { steps, divergences };
}

function entryOrdersCreated(step: ScaledStep): WalletStepResult['decisions']['orders'] {
  return step.result.decisions.orders.filter(
    (order) =>
      order.purpose === 'entry' && order.createdCandleOpenTime === step.input.candle.openTime,
  );
}

// Risco da entrada: nunca acima de escala × riskPerTrade × caixa da decisão e menos de 1e-8 abaixo dele (um
// arredondamento só, para baixo). O caixa da decisão é o do fechamento, depois dos preenchimentos do candle: a
// ordem nova não debita nada até preencher.
function riskViolation(step: ScaledStep): string | undefined {
  const scale = step.input.entryRiskScale ?? ENTRY_RISK_SCALE.FULL;
  const ceiling = toEngineDecimal(step.result.state.cash)
    .times(step.input.strategy.config.risk.riskPerTrade)
    .times(scale);
  for (const order of entryOrdersCreated(step)) {
    if (order.status !== 'created') continue;
    const risk = toEngineDecimal(order.riskAmount ?? '-1');
    if (risk.greaterThan(ceiling) || ceiling.minus(risk).gte(MONEY_STEP)) {
      return `risco ${risk.toFixed()} fora de (teto − 1e-8, teto ${ceiling.toFixed()}]`;
    }
  }
  if (scale === ENTRY_RISK_SCALE.NONE && entryOrdersCreated(step).length > 0) {
    return "escala '0' deixou um evento de entrada";
  }
  return undefined;
}

// A escala só existe para a entrada nova: sem BUY o passo é IDÊNTICO ao mesmo passo sem escala, e com BUY o
// que acontece antes do fechamento (preenchimentos, saídas, comandos) também.
function exitViolation(step: ScaledStep, implementation: WalletImplementation): string | undefined {
  if (step.input.entryRiskScale === undefined) return undefined;
  const unscaled = implementation({ ...step.input, entryRiskScale: undefined });
  if (step.input.signal?.action !== 'BUY') {
    const isSame = JSON.stringify(unscaled) === JSON.stringify(step.result);
    return isSame ? undefined : 'a escala mudou um passo sem BUY';
  }
  const pick = (result: WalletStepResult): string => {
    const { fills, closedPositions, commands } = result.decisions;
    return JSON.stringify([fills, closedPositions, commands]);
  };
  const isSame = pick(step.result) === pick(unscaled);
  return isSame ? undefined : 'a escala mudou a saída de um passo com BUY';
}

export function findScaleViolation(
  implementation: WalletImplementation,
  count: number = SCALE_FLOW_COUNT,
): string | undefined {
  for (let flowIndex = 0; flowIndex < count; flowIndex += 1) {
    for (const step of runScaledFlow(buildScaledFlow(flowIndex), implementation)) {
      const violation = riskViolation(step) ?? exitViolation(step, implementation);
      if (violation !== undefined) return `fluxo ${flowIndex}, passo ${step.index}: ${violation}`;
    }
  }
  return undefined;
}
