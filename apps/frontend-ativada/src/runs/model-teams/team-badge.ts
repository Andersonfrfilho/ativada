// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatTimeInZone } from '../../format/zoned-time.js';
import type { IconName } from '../../layout/Icon.component.js';
import type { ChipTone } from '../live-tracking/StatusChip.component.js';
import type { ProviderState, TeamAction } from './model-teams.constant.js';
import type { Recommendation, TeamView } from './model-teams.validation.js';

// O selo da equipe (RF19): SEMPRE ícone + palavra + tom, nunca só cor. As palavras espelham o catálogo fechado do servidor.
export type TeamBadge = { readonly icon: IconName; readonly word: string; readonly tone: ChipTone };

const RETRY_TIME_MARK = '{hora}';

const PROVIDER_BADGE: Readonly<Record<ProviderState, TeamBadge>> = {
  ready: { icon: 'check', word: 'pronto', tone: 'neutral' },
  no_key: { icon: 'alert', word: 'sem chave configurada', tone: 'warn' },
  budget_exhausted: { icon: 'pause', word: 'parada pelo teto de custo', tone: 'warn' },
  circuit_open: {
    icon: 'alert',
    word: `provedor fora (tentando de novo às ${RETRY_TIME_MARK})`,
    tone: 'warn',
  },
  key_rejected: { icon: 'alert', word: 'chave recusada pelo provedor', tone: 'warn' },
  model_not_found: {
    icon: 'alert',
    word: 'modelo indisponível no provedor; confira o id no env',
    tone: 'warn',
  },
};

const ACTION_BADGE: Readonly<Record<TeamAction, TeamBadge>> = {
  buy: { icon: 'arrowUp', word: 'comprar', tone: 'buy' },
  sell: { icon: 'arrowDown', word: 'vender', tone: 'sell' },
  hold: { icon: 'equal', word: 'esperar', tone: 'neutral' },
};

export const BADGE_OFF: TeamBadge = { icon: 'cancelled', word: 'desligada', tone: 'neutral' };
export const BADGE_THINKING: TeamBadge = { icon: 'activity', word: 'pensando', tone: 'info' };
const BADGE_UNKNOWN: TeamBadge = { icon: 'alert', word: 'sem notícia do serviço', tone: 'warn' };
const BADGE_WAITING: TeamBadge = { icon: 'check', word: 'aguardando a vela', tone: 'neutral' };

export type BadgeInput = {
  readonly team: TeamView;
  readonly latest: Recommendation | undefined;
  readonly timeZone: string;
};

// O estado do PROVEDOR (chave, teto, circuito), sem olhar o interruptor: a ficha e as preferências mostram os dois.
export function describeProviderBadge(team: TeamView, timeZone: string): TeamBadge {
  const { state, circuitUntil } = team.providerStatus;
  if (state === null) return BADGE_UNKNOWN;
  const badge = PROVIDER_BADGE[state];
  if (circuitUntil === null) return badge;
  const hour = formatTimeInZone(Date.parse(circuitUntil), timeZone);
  return { ...badge, word: badge.word.replace(RETRY_TIME_MARK, hour) };
}

// Ordem: desligada, provedor com problema, pensando, a última ação decidida, aguardando.
export function describeTeamBadge({ team, latest, timeZone }: BadgeInput): TeamBadge {
  if (!team.isEnabled) return BADGE_OFF;
  const provider = describeProviderBadge(team, timeZone);
  if (team.providerStatus.state !== 'ready') return provider;
  if (latest?.status === 'pending') return BADGE_THINKING;
  if (latest?.status === 'decided' && latest.action !== null) return ACTION_BADGE[latest.action];
  return BADGE_WAITING;
}
