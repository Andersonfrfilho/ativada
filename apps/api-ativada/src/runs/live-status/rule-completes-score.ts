// Copyright (c) 2026 Ada Technology. All rights reserved.
import { toEngineDecimal, TRIGGER_STATE, type TriggerState } from '@ativada/strategy-engine';

export type CompletesScoreParams = {
  readonly state: TriggerState;
  readonly scoreGap: string;
  readonly rule: { readonly isMet: boolean; readonly vote: number; readonly weight: string };
};

// Esta regra SOZINHA completa o placar (spec 014, T1.3): ainda não votou a favor, o voto dela empurra para o lado que a
// carteira espera (comprar sem posição, vender com posição) e o peso cobre o que falta (`scoreGap`). Puro, só decimal exato.
export function completesScore(params: CompletesScoreParams): boolean {
  const { state, scoreGap, rule } = params;
  if (rule.isMet) return false;
  const isInFavor = state === TRIGGER_STATE.AWAITING_ENTRY ? rule.vote > 0 : rule.vote < 0;
  if (!isInFavor) return false;
  const gap = toEngineDecimal(scoreGap);
  return gap.greaterThan(0) && toEngineDecimal(rule.weight).greaterThanOrEqualTo(gap);
}
