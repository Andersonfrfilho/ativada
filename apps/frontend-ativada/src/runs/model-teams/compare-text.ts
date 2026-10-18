// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ModelTeamKey } from './model-teams.constant.js';
import type { ComparisonItem } from './model-teams.validation.js';

export const COMPARE_TEXT = {
  TITLE: 'Equipes × regras',
  HINT: 'Últimas 24 velas de 15 min: o voto de cada regra, a indicação de cada equipe ◆ e o que a vela seguinte fez.',
  NOTICE: 'Comparação de acerto do lado da próxima vela; não mede lucro e não é recomendação.',
  NO_RULES: 'sem analista',
  LOADING: 'Carregando a comparação…',
  ERROR: 'Não foi possível carregar a comparação agora.',
  EMPTY: 'Ainda não há velas fechadas para comparar.',
  MORE: 'Ver velas anteriores',
  HIT: 'acertou',
  MISS: 'errou',
} as const;

// As quatro famílias de regra, na ordem da varanda.
export const RULE_COLUMNS = [
  { key: 'trend', label: 'Tendência' },
  { key: 'reversion', label: 'Reversão' },
  { key: 'volume', label: 'Volume' },
  { key: 'sentiment', label: 'Sentimento' },
] as const;

export const NEXT_WORD: Readonly<Record<ComparisonItem['next'], string>> = {
  up: '↗ subiu',
  down: '↘ desceu',
  equal: '= igual',
  open: 'ainda aberta',
};

export type Cell = {
  readonly word: string;
  // `true` = ✓ acertou, `false` = ✗ errou, `null` = sem marca (empate, lacuna, vela aberta ou sem lado).
  readonly isHit: boolean | null;
};

const VOTE_WORD = new Map<number, string>([
  [1, '↗ a favor'],
  [-1, '↘ contra'],
  [0, '— neutro'],
]);

export function describeRuleCell(item: ComparisonItem, key: string): Cell {
  if (item.rules === null) return { word: COMPARE_TEXT.NO_RULES, isHit: null };
  const row = item.rules.find((candidate) => candidate.key === key);
  if (row === undefined || row.vote === null) return { word: 'não vota', isHit: null };
  return { word: VOTE_WORD.get(row.vote) ?? '—', isHit: row.isHit };
}

const ACTION_WORD = { buy: '↗ comprar', sell: '↘ vender', hold: '— esperar' } as const;

export function describeTeamCell(item: ComparisonItem, teamKey: ModelTeamKey): Cell {
  const row = item.teams.find((candidate) => candidate.teamKey === teamKey);
  if (row === undefined || row.status === null) return { word: '—', isHit: null };
  if (row.status === 'pending') return { word: '◷ pensando', isHit: null };
  if (row.status !== 'decided' || row.action === null) return { word: 'sem leitura', isHit: null };
  return { word: ACTION_WORD[row.action], isHit: row.isHit };
}

export function markOf(isHit: boolean | null): { symbol: string; word: string } | undefined {
  if (isHit === null) return undefined;
  return isHit ? { symbol: '✓', word: COMPARE_TEXT.HIT } : { symbol: '✗', word: COMPARE_TEXT.MISS };
}
