// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SeatLook } from '../team-room.types.js';
import type { ModelTeamsView, TeamCardModel } from '../../model-teams/useModelTeamsView.hook.js';
import type { BalconyAgent } from './balcony-agents.js';
import { BALCONY_SLOT, BALCONY_TEXT, type BalconySlot } from './balcony.constant.js';

const SLOT_OF: Readonly<Record<TeamCardModel['key'], BalconySlot>> = {
  nina: BALCONY_SLOT.NINA,
  lucas: BALCONY_SLOT.LUCAS,
  olivia: BALCONY_SLOT.OLIVIA,
};

const LOADING_SEAL = { icon: 'info', word: BALCONY_TEXT.MODELS_LOADING } as const;

// Ligada com problema no provedor (sem chave, teto, provedor fora): o personagem fica esmaecido, mas o motivo aparece.
function isQuiet(card: TeamCardModel): boolean {
  const { badge } = card;
  return badge === undefined || badge.tone === 'warn';
}

function lineOf(card: TeamCardModel, status: ModelTeamsView['status']): string {
  const { badge, latest } = card;
  if (latest?.status === 'decided') {
    return latest.isReasonHidden || latest.roles === null
      ? BALCONY_TEXT.MODEL_HIDDEN
      : latest.roles.decision.reason;
  }
  if (status === 'absent') return BALCONY_TEXT.MODEL_PAST_LINE;
  if (badge?.tone === 'warn') return `${badge.word}: não opina.`;
  return BALCONY_TEXT.MODEL_NO_OPINION;
}

function voteOf(card: TeamCardModel): SeatLook | undefined {
  const { badge } = card;
  return badge === undefined ? undefined : { tone: badge.tone, icon: badge.icon, word: badge.word };
}

// Uma equipe de modelo (◆) com o mesmo molde dos agentes de regra: nome, selo de estado, balão curto e ficha.
export function buildModelAgent(
  card: TeamCardModel,
  status: ModelTeamsView['status'],
): BalconyAgent {
  const seal = card.badge ?? LOADING_SEAL;
  const roleFull = `Equipe de modelo ${card.provider}`;
  return {
    slot: SLOT_OF[card.key],
    kind: 'model',
    teamKey: card.key,
    name: card.name,
    roleShort: card.provider,
    roleFull,
    figureRole: 'model',
    family: undefined,
    tone: isQuiet(card) ? 'quiet' : 'normal',
    seal: { icon: seal.icon, word: seal.word },
    vote: voteOf(card),
    line: lineOf(card, status),
    lineTerm: undefined,
    placard: undefined,
    horizon: undefined,
    facts: [],
    ariaLabel: `${card.name}, equipe de modelo ${card.provider}, ${seal.word}. Ver a ficha`,
  };
}
