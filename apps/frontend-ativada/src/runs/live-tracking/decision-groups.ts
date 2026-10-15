// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Decision } from './live-status.validation.js';

// Menos que isto e a linha repetida aparece por inteiro: esconder uma só vela não poupa nada.
const MINIMUM_HIDDEN_CANDLES = 2;

export type DecisionGroup = {
  readonly head: Decision;
  // As velas seguidas (mais antigas) com a MESMA decisão, pontuação e motivo da `head`.
  readonly hidden: readonly Decision[];
};

function sameOutcome(left: Decision, right: Decision): boolean {
  return (
    left.outcome === right.outcome && left.score === right.score && left.message === right.message
  );
}

// Junta o que o `live-status` já trouxe com as páginas anteriores: sem repetir vela e da mais nova à mais antiga.
export function mergeDecisions(lists: readonly (readonly Decision[])[]): readonly Decision[] {
  const byCandle = new Map<number, Decision>();
  for (const list of lists) {
    for (const decision of list) byCandle.set(decision.candleTime, decision);
  }
  return [...byCandle.values()].sort((left, right) => right.candleTime - left.candleTime);
}

// Velas seguidas iguais viram uma linha com "Mostrar N velas iguais" (a cada hora sem novidade não polui a tabela).
export function groupDecisions(decisions: readonly Decision[]): readonly DecisionGroup[] {
  const groups: DecisionGroup[] = [];
  let index = 0;
  while (index < decisions.length) {
    const head = decisions[index];
    if (head === undefined) break;
    let end = index + 1;
    while (end < decisions.length && sameOutcome(head, decisions[end] ?? head)) end += 1;
    const equalRun = decisions.slice(index + 1, end);
    if (equalRun.length >= MINIMUM_HIDDEN_CANDLES) {
      groups.push({ head, hidden: equalRun });
      index = end;
    } else {
      groups.push({ head, hidden: [] });
      index += 1;
    }
  }
  return groups;
}
