// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  formatScaled,
  parseScaled,
  roundScaledDirected,
  roundScaledHalfUp,
} from '../../format/decimal.js';
import { formatPrice } from '../../format/format.js';
import { SCOREBOARD_MINIMUM } from './model-teams.constant.js';
import type { Recommendation, Scoreboard } from './model-teams.validation.js';

const COST_PLACES = 4;
const PERCENT_FACTOR = 100n;
const NO_PLACES = { minimumFraction: 0, maximumFraction: 0 } as const;

export const VERDICT_WORD = {
  above: 'acima da moeda ao ar (50%)',
  even: 'no nível da moeda ao ar (50%): ainda não dá para distinguir',
  below: 'abaixo da moeda ao ar (50%)',
  too_few: `poucas previsões (menos de ${SCOREBOARD_MINIMUM}): ainda não dá para medir`,
} as const;

// Custo estimado: arredonda PARA CIMA em 4 casas (contra o usuário), sempre a partir do texto, em BigInt.
export function formatUsd(text: string): string {
  const scaled = parseScaled(text);
  if (scaled === undefined) return '—';
  const rounded = roundScaledDirected(scaled, COST_PLACES, 'up');
  return `US$ ${formatScaled(rounded, { minimumFraction: COST_PLACES, maximumFraction: COST_PLACES })}`;
}

function toPercent(ratio: string | null, direction: 'up' | 'down' | 'nearest'): string | undefined {
  const scaled = ratio === null ? undefined : parseScaled(ratio);
  if (scaled === undefined) return undefined;
  const percent = scaled * PERCENT_FACTOR;
  const rounded =
    direction === 'nearest'
      ? roundScaledHalfUp(percent, 0)
      : roundScaledDirected(percent, 0, direction);
  return `${formatScaled(rounded, NO_PLACES)}%`;
}

export type ScoreboardText = {
  readonly headline: string;
  readonly verdict: string;
  readonly range: string | undefined;
};

// "3 de 5 acertos (60%)", o veredito contra a moeda ao ar e a faixa de Wilson; "poucas previsões" abaixo de 30.
export function describeScoreboard(scoreboard: Scoreboard): ScoreboardText {
  const rate = toPercent(scoreboard.hitRate, 'nearest');
  const lower = toPercent(scoreboard.lower, 'down');
  const upper = toPercent(scoreboard.upper, 'up');
  const counted = `${scoreboard.hits} de ${scoreboard.counted} acertos`;
  return {
    headline:
      scoreboard.counted === 0 || rate === undefined
        ? 'Sem previsões contadas ainda'
        : `${counted} (${rate})`,
    verdict: VERDICT_WORD[scoreboard.verdict],
    range:
      lower === undefined || upper === undefined
        ? undefined
        : `faixa de Wilson: entre ${lower} e ${upper}`,
  };
}

export function describeFailures(failures: {
  readonly hours: number;
  readonly total: number;
  readonly failed: number;
}): string {
  if (failures.total === 0) return `Falhas em ${failures.hours} h: nenhuma chamada ainda`;
  const percent = Math.round((failures.failed * 100) / failures.total);
  return `Falhas em ${failures.hours} h: ${failures.failed} de ${failures.total} chamadas (${percent}%)`;
}

export function describeLevels(levels: NonNullable<Recommendation['levels']>): string {
  return `entrada ${formatPrice(levels.entryPrice)} · alvo ${formatPrice(levels.targetPrice)} · proteção ${formatPrice(levels.stopPrice)}`;
}
