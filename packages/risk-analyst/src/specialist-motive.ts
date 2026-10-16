// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal } from '@ativada/strategy-engine';

import { SPECIALIST_CATALOG } from './specialist-catalog.js';
import {
  CANCELLED_RULES_MOTIVE,
  READING_PLACEHOLDER,
  RULE_MOTIVE,
  SENTIMENT_MISSING_MOTIVE,
  WARMING_UP_MOTIVE,
  type RuleMotive,
} from './specialist-motive.constant.js';
import type { SpecialistKey } from './analyst.constant.js';
import type { AnalystVote, RuleVote } from './analyst.types.js';

const READING_DECIMAL_PLACES = 1;

export type SpecialistMotiveParams = {
  readonly key: SpecialistKey;
  readonly vote: AnalystVote | null;
  readonly isUnread: boolean;
  readonly ruleVotes: readonly RuleVote[] | undefined;
};

// A leitura com 1 casa e vírgula (78,2), sem zero à direita (55): o mesmo texto que a spec 008 mostra.
function readingText(reading: number | null): string {
  if (reading === null) return '';
  const rounded = new EngineDecimal(reading).toDecimalPlaces(READING_DECIMAL_PLACES);
  return ` (${rounded.toFixed().replace('.', ',')})`;
}

function phraseOf(vote: RuleVote, kind: keyof RuleMotive): string | null {
  const motive = RULE_MOTIVE[vote.ruleId];
  return motive === undefined
    ? null
    : motive[kind].replace(READING_PLACEHOLDER, readingText(vote.reading));
}

// Os votos na ordem das regras do catálogo (A2), de modo que "a primeira regra" seja sempre a mesma.
function inCatalogOrder(key: SpecialistKey, votes: readonly RuleVote[]): readonly RuleVote[] {
  const order = SPECIALIST_CATALOG[key].config.rules.map((rule) => rule['id']);
  return [...votes].sort((left, right) => order.indexOf(left.ruleId) - order.indexOf(right.ruleId));
}

// Voto a favor ou contra: a primeira regra que votou no mesmo sinal. Voto neutro: as regras se anulam (houve +1 e −1) ou
// vale a frase neutra da primeira regra.
function describeCast(vote: AnalystVote, ordered: readonly RuleVote[]): string | null {
  if (vote !== 0) {
    const decisive = ordered.find((candidate) => candidate.vote === vote);
    return decisive === undefined ? null : phraseOf(decisive, vote === 1 ? 'favor' : 'against');
  }
  const hasBothSides =
    ordered.some((candidate) => candidate.vote === 1) &&
    ordered.some((candidate) => candidate.vote === -1);
  if (hasBothSides) return CANCELLED_RULES_MOTIVE;
  const first = ordered.find((candidate) => candidate.vote === 0);
  return first === undefined ? null : phraseOf(first, 'neutral');
}

// O motivo curto do voto (spec 011, RF05): qual regra dele decidiu. `null` quando a decisão foi gravada antes dos votos por
// regra existirem. Nunca texto livre: toda frase vem do catálogo fechado.
export function describeSpecialistMotive(params: SpecialistMotiveParams): string | null {
  const { vote, ruleVotes } = params;
  if (vote === null) return WARMING_UP_MOTIVE;
  if (params.isUnread) return SENTIMENT_MISSING_MOTIVE;
  if (ruleVotes === undefined) return null;
  return describeCast(vote, inCatalogOrder(params.key, ruleVotes));
}
