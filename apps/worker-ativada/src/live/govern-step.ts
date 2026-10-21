// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AnalystDecisionInput } from '@ativada/database';
import { toGovernInputs, type GovernInputs } from '@ativada/risk-analyst';
import { ENTRY_RISK_SCALE, EngineInputError, type StepResult } from '@ativada/strategy-engine';

import { describeAnalystFailure } from './analyst-failure.js';
import { ANALYST_FAILURE_CODE } from './analyst-live.constant.js';
import { analyzeStep, type AnalystVerdict } from './analyst-step.js';
import { toGovernedRecord, toGovernFailedRecord } from './govern-record.js';
import type { AnalystRunKit, AnalystStepContext } from './load-analyst-context.js';

// Falha segura (A21): nenhuma entrada nova nesta vela e nenhum comando. NUNCA se refaz o passo sem o analista.
const SAFE_INPUTS: GovernInputs = { commands: [], entryRiskScale: ENTRY_RISK_SCALE.NONE };

export type GovernStepParams = {
  readonly kit: AnalystRunKit;
  // O passo já feito sem a entrada do analista (a primeira passada, ou a da meta decidida).
  readonly step: AnalystStepContext;
  readonly isGoalEnded: boolean;
  // Refaz o MESMO candle com as entradas do analista (o passo é puro).
  readonly redo: (inputs: GovernInputs) => StepResult;
};

export type GovernedStep = { readonly result: StepResult; readonly record: AnalystDecisionInput };

type Applied = { readonly result: StepResult; readonly refusal: string | undefined };

function isNeutral(inputs: GovernInputs): boolean {
  return inputs.commands.length === 0 && inputs.entryRiskScale === ENTRY_RISK_SCALE.FULL;
}

function readVerdict(kit: AnalystRunKit, step: AnalystStepContext): Promise<AnalystVerdict> {
  if (kit.isSupported) return analyzeStep(kit, step);
  return Promise.resolve({ failureCode: ANALYST_FAILURE_CODE.REQUEST_UNSUPPORTED });
}

// Meta decidida: o passo da meta já é o final (a carteira parou). Escala cheia e nenhum comando = o passo antigo, exato.
// O motor recusar a entrada do analista refaz SÓ com a escala 0 e guarda o código da recusa.
function applyInputs(params: GovernStepParams, inputs: GovernInputs): Applied {
  if (params.isGoalEnded || isNeutral(inputs)) {
    return { result: params.step.result, refusal: undefined };
  }
  try {
    return { result: params.redo(inputs), refusal: undefined };
  } catch (error: unknown) {
    if (!(error instanceof EngineInputError)) throw error;
    return { result: params.redo(SAFE_INPUTS), refusal: describeAnalystFailure(error) };
  }
}

function buildRecord(params: {
  readonly kit: AnalystRunKit;
  readonly step: AnalystStepContext;
  readonly verdict: AnalystVerdict;
  readonly inputs: GovernInputs;
  readonly refusal: string | undefined;
}): AnalystDecisionInput {
  const { kit, step, verdict, inputs, refusal } = params;
  const fail = (failureCode: string): AnalystDecisionInput =>
    toGovernFailedRecord({ runId: kit.runId, candleTime: step.candle.openTime, failureCode });
  if (refusal !== undefined) return fail(refusal);
  if ('failureCode' in verdict) return fail(verdict.failureCode);
  return toGovernedRecord({ runId: kit.runId, decision: verdict.decision, inputs });
}

// O analista GOVERNA a vela `t` (A21): decide sobre o passo já feito, traduz a decisão em teto de entrada e saída por tempo
// (`toGovernInputs`, a mesma função do contrafactual), refaz o passo com elas e devolve a linha da decisão. O histórico guarda
// o resultado FINAL; nada lança além do que o passo puro já lançaria.
export async function settleGovernedStep(params: GovernStepParams): Promise<GovernedStep> {
  const { kit, step } = params;
  const verdict = await readVerdict(kit, step);
  const inputs = toGovernInputs({
    decision: 'decision' in verdict ? verdict.decision : undefined,
    wallet: { hasPosition: step.result.state.wallet.position !== null },
    candle: step.candle,
    isGoalEnded: params.isGoalEnded,
  });
  const applied = applyInputs(params, inputs);
  kit.history.record(step.candle, applied.result.decisions);
  const record = buildRecord({ kit, step, verdict, inputs, refusal: applied.refusal });
  return { result: applied.result, record };
}
