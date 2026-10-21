// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  COMMAND_KIND,
  COMMAND_REASON,
  ENTRY_RISK_SCALE,
  type EngineCommand,
  type EntryRiskScale,
} from '@ativada/strategy-engine';

import { ANALYST_COMMAND_KIND, ENTRY_GATE } from './analyst.constant.js';
import type { AnalystDecision } from './analyst-decision.types.js';

export type GovernCandle = { readonly openTime: number; readonly closeTime: number };

export type ToGovernInputsParams = {
  // A decisão da vela; `undefined` = o analista falhou nesta vela (falha segura, A21).
  readonly decision: AnalystDecision | undefined;
  readonly wallet: { readonly hasPosition: boolean };
  readonly candle: GovernCandle;
  // A meta já decidiu (ou gravou o desfecho): ela encerra e o analista não manda comando (A21 4).
  readonly isGoalEnded: boolean;
};

// O que o analista entrega ao passo no governar (A21): o teto da entrada nova e os comandos da carteira.
export type GovernInputs = {
  readonly commands: readonly EngineCommand[];
  readonly entryRiskScale: EntryRiskScale;
};

const ENTRY_RISK_SCALES: readonly EntryRiskScale[] = Object.values(ENTRY_RISK_SCALE);

// Fora do conjunto fechado vale a pausa: o tamanho nunca passa de 1.
function scaleOf(value: string): EntryRiskScale {
  return ENTRY_RISK_SCALES.find((scale) => scale === value) ?? ENTRY_RISK_SCALE.NONE;
}

function buildTimeExit(candle: GovernCandle): EngineCommand {
  return {
    commandId: `analyst:${candle.openTime}:${ANALYST_COMMAND_KIND.EXIT_POSITION}`,
    issuedAt: candle.closeTime,
    kind: COMMAND_KIND.EXIT_POSITION,
    reason: COMMAND_REASON.ANALYST_TIMEOUT,
  };
}

// A tradução da decisão para as entradas do passo no governar (A21), pura e a mesma no worker e no contrafactual.
// Falha ou porta fechada = escala '0' (só a ENTRADA nova da vela some); a SAÍDA nunca é barrada: `exit_position` vai
// sempre que a saída por tempo está devida e há posição; meta decidida = nenhum comando.
export function toGovernInputs(params: ToGovernInputsParams): GovernInputs {
  const { decision, wallet, candle, isGoalEnded } = params;
  if (decision === undefined) return { commands: [], entryRiskScale: ENTRY_RISK_SCALE.NONE };
  const isGateOpen = decision.entryGate === ENTRY_GATE.OPEN;
  const entryRiskScale = isGateOpen ? scaleOf(decision.riskScale) : ENTRY_RISK_SCALE.NONE;
  const isTimeExit = decision.timeExitDue && wallet.hasPosition && !isGoalEnded;
  return { commands: isTimeExit ? [buildTimeExit(candle)] : [], entryRiskScale };
}
