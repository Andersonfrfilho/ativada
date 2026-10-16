// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AnalystDecisionInput } from '@ativada/database';
import { decideAnalyst } from '@ativada/risk-analyst';

import { describeAnalystFailure } from './analyst-failure.js';
import { toDecidedRecord, toFailedRecord } from './analyst-record.js';
import {
  loadAnalystInput,
  type AnalystRunKit,
  type AnalystStepContext,
} from './load-analyst-context.js';

// O passo do analista em SOMBRA (spec 007, A18): decide a vela `t` depois do passo puro do motor e devolve a linha que entra
// na MESMA transação do passo. Nada aqui volta para a simulação, e NADA lança: a falha vira a linha `failed` com o código.
export async function decideShadowStep(
  kit: AnalystRunKit,
  step: AnalystStepContext,
): Promise<AnalystDecisionInput> {
  // O registro do passo vale mesmo se a decisão falhar: a próxima vela precisa do patrimônio e das posições desta.
  kit.history.record(step.candle, step.result.decisions);
  try {
    const decision = decideAnalyst(await loadAnalystInput(kit, step));
    return toDecidedRecord({ runId: kit.runId, decision });
  } catch (error: unknown) {
    return toFailedRecord({
      runId: kit.runId,
      candleTime: step.candle.openTime,
      failureCode: describeAnalystFailure(error),
    });
  }
}
