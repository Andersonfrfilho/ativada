// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  buildCadenceLine,
  buildLockLines,
  buildOffCadenceMessage,
  buildPostureLine,
  buildReasonMessage,
  buildTimeExitMessage,
  lockMessage,
} from './analyst-messages.js';
import { ANALYST_DISCLAIMER } from './analyst-messages.constant.js';
import type { AnalystDecision } from './analyst-decision.types.js';
import { buildSpecialistRow, type SpecialistRow } from './specialist-messages.js';

export type AnalystMessages = {
  readonly postureLine: string;
  readonly offCadenceMessage: string | null;
  readonly cadenceLine: string | null;
  readonly reasonMessage: string;
  readonly lockLines: readonly string[];
  readonly specialists: readonly SpecialistRow[];
  readonly timeExitMessage: string | null;
  readonly disclaimer: string;
};

export type BuildAnalystMessagesParams = {
  readonly decision: AnalystDecision;
  readonly riskPerTrade: string;
  readonly isShadow: boolean;
};

// Todas as frases de uma decisão, prontas para a rota e para o painel; termina sempre no aviso fixo (RNF11).
export function buildAnalystMessages(params: BuildAnalystMessagesParams): AnalystMessages {
  const { decision, riskPerTrade, isShadow } = params;
  return {
    postureLine: buildPostureLine(decision, riskPerTrade),
    offCadenceMessage: buildOffCadenceMessage(decision),
    cadenceLine: buildCadenceLine(decision),
    reasonMessage: buildReasonMessage(decision),
    lockLines: buildLockLines(decision),
    specialists: decision.specialists.map(buildSpecialistRow),
    timeExitMessage: decision.timeExitDue
      ? buildTimeExitMessage({ maxTradeMinutes: decision.maxTradeMinutes, isShadow })
      : null,
    disclaimer: ANALYST_DISCLAIMER,
  };
}

// A frase de cada trava ATIVA (A17), na ordem da A10; sem trava ativa a lista é vazia.
export function buildActiveLockMessages(decision: AnalystDecision): readonly string[] {
  return decision.locks
    .filter((lock) => lock.isActive)
    .map((lock) => lockMessage(decision, lock.key));
}
