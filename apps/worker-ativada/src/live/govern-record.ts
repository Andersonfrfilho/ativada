// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AnalystDecisionInput } from '@ativada/database';
import type { AnalystDecision, GovernInputs } from '@ativada/risk-analyst';

import { ANALYST_RECORD_MODE } from './analyst-live.constant.js';
import { toDecidedRecord, toFailedRecord } from './analyst-record.js';

// A linha do governar (A21): o que o passo RECEBEU de verdade. O tamanho gravado é a escala efetiva (porta fechada = 0) e
// `commands` são os comandos enviados ao motor (só a saída por tempo), não o que a sombra "daria".
export function toGovernedRecord(params: {
  readonly runId: string;
  readonly decision: AnalystDecision;
  readonly inputs: GovernInputs;
}): AnalystDecisionInput {
  const { runId, decision, inputs } = params;
  return {
    ...toDecidedRecord({ runId, decision }),
    mode: ANALYST_RECORD_MODE.GOVERN,
    riskScale: inputs.entryRiskScale,
    commands: inputs.commands.map(({ commandId, kind, reason }) => ({ commandId, kind, reason })),
  };
}

// A falha no governar grava só o código estável; a escala daquela vela foi 0.
export function toGovernFailedRecord(params: {
  readonly runId: string;
  readonly candleTime: number;
  readonly failureCode: string;
}): AnalystDecisionInput {
  return { ...toFailedRecord(params), mode: ANALYST_RECORD_MODE.GOVERN };
}
