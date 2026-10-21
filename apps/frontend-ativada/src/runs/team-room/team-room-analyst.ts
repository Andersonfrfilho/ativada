// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ANALYST_TEXT, FAILED_LOOK, POSTURE_LOOK } from '../analyst/analyst.constant.js';
import type { Analyst, AnalystDecision } from '../analyst/analyst.validation.js';
import type { RiskAnalystView, SeatLook } from './team-room.types.js';

const MISSING_LOOK: SeatLook = { tone: FAILED_LOOK.tone, icon: FAILED_LOOK.icon, word: 'sem fala' };

function lookOf(decision: AnalystDecision): SeatLook {
  if (decision.status === 'failed') {
    return { tone: FAILED_LOOK.tone, icon: FAILED_LOOK.icon, word: ANALYST_TEXT.FAILED_WORD };
  }
  const look = POSTURE_LOOK[decision.posture];
  return { tone: look.tone, icon: look.icon, word: decision.postureLabel };
}

// Só frases do servidor: a postura, o motivo e o que mais a decisão trouxe (fora da janela, saída por tempo).
function linesOf(decision: AnalystDecision): readonly string[] {
  if (decision.status === 'failed') return [decision.message];
  return [
    decision.message,
    decision.reasonMessage,
    decision.offCadenceMessage,
    decision.timeExitMessage,
  ].filter((line): line is string => line !== null);
}

export function buildRiskAnalystView(decision: AnalystDecision): RiskAnalystView {
  return {
    name: ANALYST_TEXT.TITLE,
    look: lookOf(decision),
    lines: linesOf(decision),
    isShadow: decision.isShadow,
  };
}

// A simulação não está em condições de decidir (parada, esperando velas, encerrada): a frase do servidor no lugar da postura.
export function buildUnavailableRiskAnalyst(analyst: Analyst): RiskAnalystView | undefined {
  const { current } = analyst;
  if (current.status !== 'unavailable') return undefined;
  return {
    name: ANALYST_TEXT.TITLE,
    look: MISSING_LOOK,
    lines: [current.message],
    isShadow: analyst.mode === 'shadow',
  };
}

export function buildMissingRiskAnalyst(isShadow: boolean): RiskAnalystView {
  return {
    name: ANALYST_TEXT.TITLE,
    look: MISSING_LOOK,
    lines: [ANALYST_TEXT.SEAT_WITHOUT_SPEECH],
    isShadow,
  };
}
