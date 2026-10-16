// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AnalystDecisionInput } from '@ativada/database';
import { decideAnalyst, type AnalystDecision } from '@ativada/risk-analyst';

import { describeAnalystFailure } from './analyst-failure.js';
import { toDecidedRecord, toFailedRecord } from './analyst-record.js';
import {
  loadAnalystInput,
  type AnalystRunKit,
  type AnalystStepContext,
} from './load-analyst-context.js';

// A decisão da vela `t` ou o código estável da falha (A18): NADA lança, o texto do erro nunca passa adiante.
export type AnalystVerdict =
  { readonly decision: AnalystDecision } | { readonly failureCode: string };

// Decide a vela `t` depois do passo puro do motor; a sombra e o governar leem a MESMA decisão.
export async function analyzeStep(
  kit: AnalystRunKit,
  step: AnalystStepContext,
): Promise<AnalystVerdict> {
  // O registro do passo vale mesmo se a decisão falhar: a próxima vela precisa do patrimônio e das posições desta.
  kit.history.record(step.candle, step.result.decisions);
  try {
    return { decision: decideAnalyst(await loadAnalystInput(kit, step)) };
  } catch (error: unknown) {
    return { failureCode: describeAnalystFailure(error) };
  }
}

// O passo do analista em SOMBRA (spec 007, A18): devolve a linha que entra na MESMA transação do passo. Nada aqui volta
// para a simulação, e a falha vira a linha `failed` com o código.
export async function decideShadowStep(
  kit: AnalystRunKit,
  step: AnalystStepContext,
): Promise<AnalystDecisionInput> {
  const verdict = await analyzeStep(kit, step);
  if ('failureCode' in verdict) {
    return toFailedRecord({
      runId: kit.runId,
      candleTime: step.candle.openTime,
      failureCode: verdict.failureCode,
    });
  }
  return toDecidedRecord({ runId: kit.runId, decision: verdict.decision });
}
