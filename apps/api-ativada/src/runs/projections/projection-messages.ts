// Copyright (c) 2026 Ada Technology. All rights reserved.
import { COIN_FLIP_VERDICT, type CoinFlipVerdict } from '@ativada/statistics';
import { ROUNDING_DIRECTION, toEngineDecimal } from '@ativada/strategy-engine';

import { formatPoints, formatRatePercent } from '../live-status/live-number-format.js';
import {
  PROJECTION_SIDE,
  PROJECTION_STANCE,
  PROJECTION_STRENGTH,
  PROJECTION_UNAVAILABLE_REASON,
  type ProjectionSide,
  type ProjectionStance,
  type ProjectionStrength,
  type ProjectionUnavailableReason,
} from './projections.constant.js';

// Catálogo fechado das frases da previsão (ADR 0002, spec 009, P9): nenhuma leva data ou hora (o painel formata no fuso).
const STANCE_LABEL: Readonly<Record<ProjectionStance, string>> = {
  [PROJECTION_STANCE.BUY]: 'Tende a COMPRAR',
  [PROJECTION_STANCE.HOLD]: 'Tende a SEGURAR',
  [PROJECTION_STANCE.SELL]: 'Tende a VENDER',
  [PROJECTION_STANCE.STAY_OUT]: 'Tende a FICAR DE FORA',
};

const STRENGTH_LABEL: Readonly<Record<ProjectionStrength, string>> = {
  [PROJECTION_STRENGTH.WEAK]: 'fraco',
  [PROJECTION_STRENGTH.STRONG]: 'forte',
  [PROJECTION_STRENGTH.DECIDED]: 'decidiu',
};

const SIDE_VERB = {
  [PROJECTION_SIDE.BUY]: 'comprar',
  [PROJECTION_SIDE.SELL]: 'vender',
} as const;

const UNAVAILABLE_MESSAGE: Readonly<Record<ProjectionUnavailableReason, string>> = {
  [PROJECTION_UNAVAILABLE_REASON.NEUTRAL]: 'O placar está em 0: nenhuma regra puxa para um lado.',
  [PROJECTION_UNAVAILABLE_REASON.WARMING_UP]:
    'A estratégia ainda está juntando velas para calcular as regras.',
  [PROJECTION_UNAVAILABLE_REASON.NO_CANDLE]: 'Aguardando a primeira vela fechar.',
  [PROJECTION_UNAVAILABLE_REASON.NOT_RUNNING]:
    'A simulação não está rodando: não há próxima decisão.',
};

const HISTORY_NOT_RUNNING_MESSAGE =
  'Este é um teste no histórico: não há próxima decisão. O histórico de acertos está abaixo.';
const NO_RESULT_MESSAGE = 'Nenhuma previsão com resultado ainda.';

const VERDICT_MESSAGE: Readonly<Record<CoinFlipVerdict, string>> = {
  [COIN_FLIP_VERDICT.ABOVE]: 'Até aqui, a tendência acertou o lado mais vezes que uma moeda ao ar.',
  [COIN_FLIP_VERDICT.EVEN]:
    'Até aqui, a tendência acertou o lado tanto quanto uma moeda ao ar. Ela serve para ler o placar, não para adivinhar o preço.',
  [COIN_FLIP_VERDICT.BELOW]: 'Até aqui, a tendência errou o lado mais vezes que uma moeda ao ar.',
  [COIN_FLIP_VERDICT.TOO_FEW]: 'Ainda há poucas previsões para dizer se acerta mais que o acaso.',
};

// Com sinal explícito: `+1`, `−1` (U+2212) e `0` sem sinal; vírgula decimal e sem zeros à direita.
function formatSignedPoints(text: string): string {
  const value = toEngineDecimal(text);
  if (value.isZero()) return '0';
  return value.isPositive() ? `+${formatPoints(text)}` : formatPoints(text);
}

function formatPercent(rate: string): string {
  return formatRatePercent(rate, ROUNDING_DIRECTION.DOWN);
}

export function describeLabel(params: {
  readonly stance: ProjectionStance;
  readonly strength: ProjectionStrength;
}): string {
  return `${STANCE_LABEL[params.stance]} · ${STRENGTH_LABEL[params.strength]}`;
}

export function describeReason(params: {
  readonly side: Exclude<ProjectionSide, 'none'>;
  readonly score: string;
  readonly threshold: string;
}): string {
  const score = formatSignedPoints(params.score);
  const threshold = formatSignedPoints(params.threshold);
  return `Placar ${score} de ${threshold} para ${SIDE_VERB[params.side]}.`;
}

export function describeUnavailable(params: {
  readonly reason: ProjectionUnavailableReason;
  readonly isLive: boolean;
}): string {
  const isHistory = params.reason === PROJECTION_UNAVAILABLE_REASON.NOT_RUNNING && !params.isLive;
  return isHistory ? HISTORY_NOT_RUNNING_MESSAGE : UNAVAILABLE_MESSAGE[params.reason];
}

export type SummaryMessageParams = {
  readonly hits: number;
  readonly counted: number;
  readonly hitRate: string | null;
  readonly upRate: string | null;
  readonly insideRate: string | null;
};

// Acerto do lado ao lado da moeda ao ar, em porcentagem (as taxas já têm 4 casas, então os 2 da porcentagem são exatos).
export function describeSummary(params: SummaryMessageParams): string {
  const { hitRate, upRate, insideRate } = params;
  if (hitRate === null || upRate === null) return NO_RESULT_MESSAGE;
  const parts = [
    `Acertou o lado em ${formatPercent(hitRate)}% (${params.hits} de ${params.counted}).`,
    'Moeda ao ar: 50%.',
    `'Sempre sobe': ${formatPercent(upRate)}%.`,
  ];
  if (insideRate !== null) parts.push(`Dentro da faixa: ${formatPercent(insideRate)}%.`);
  return parts.join(' ');
}

export function describeVerdict(verdict: CoinFlipVerdict): string {
  return VERDICT_MESSAGE[verdict];
}
