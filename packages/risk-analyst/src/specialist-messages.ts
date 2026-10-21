// Copyright (c) 2026 Ada Technology. All rights reserved.
import { COIN_FLIP_VERDICT } from '@ativada/statistics';

import { STRATEGY_AUDIT_KEY } from './analyst.constant.js';
import {
  SPECIALIST_LABEL,
  STRATEGY_WEIGHT_LABEL,
  VERDICT_LABEL,
  VOTE_LABEL,
} from './analyst-messages.constant.js';
import { decimalOf } from './analyst-decimal.js';
import {
  formatTextCount,
  formatTextNumber,
  formatTextPercent,
  TEXT_ROUNDING,
} from './analyst-message-format.js';
import type { SpecialistView } from './analyst.types.js';

export type SpecialistRow = {
  readonly label: string;
  readonly vote: string;
  readonly accuracy: string;
  readonly situation: string;
  readonly weight: string;
};

function voteText(view: SpecialistView): string {
  if (view.isUnread) return VOTE_LABEL.UNREAD;
  if (view.vote === 1) return VOTE_LABEL.FOR;
  return view.vote === -1 ? VOTE_LABEL.AGAINST : VOTE_LABEL.NEUTRAL;
}

// "53,10% (1.204 de 2.267)" com o acerto arredondado para BAIXO; abaixo de 30 contadas não se mostra taxa.
function accuracyText(view: SpecialistView): string {
  if (view.verdict === COIN_FLIP_VERDICT.TOO_FEW || view.hitRate === null) {
    return `— (${formatTextCount(view.counted)} contadas)`;
  }
  return `${formatTextPercent(view.hitRate, TEXT_ROUNDING.DOWN)}% (${formatTextCount(view.hits)} de ${formatTextCount(view.counted)})`;
}

// Peso com 2 casas; um peso positivo nunca aparece como zero (arredonda para CIMA), o zero fica "0".
function weightText(view: SpecialistView): string {
  if (view.key === STRATEGY_AUDIT_KEY) return STRATEGY_WEIGHT_LABEL;
  return decimalOf(view.weight).isZero() ? '0' : formatTextNumber(view.weight, TEXT_ROUNDING.UP);
}

// Uma linha da tabela da equipe (A17): voto, acerto "N de M", situação e peso.
export function buildSpecialistRow(view: SpecialistView): SpecialistRow {
  return {
    label: SPECIALIST_LABEL[view.key],
    vote: voteText(view),
    accuracy: accuracyText(view),
    situation: VERDICT_LABEL[view.verdict],
    weight: weightText(view),
  };
}
