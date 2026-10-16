// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { IconName } from '../../layout/Icon.component.js';
import { CHIP_TONE, type ChipTone } from '../live-tracking/StatusChip.component.js';
import type { AnalystPosture } from './analyst.validation.js';

// Frases de interface do analista de risco (spec 007, T3.3). As falas do analista (postura, motivo, travas, equipe) vêm
// do servidor; aqui ficam só os rótulos fixos, e nenhuma frase promete resultado.
export const ANALYST_TEXT = {
  TITLE: 'Analista de risco',
  SEAT_NAME: 'Analista',
  LOADING: 'Carregando o analista de risco…',
  ERROR: 'Não deu para carregar o analista agora.',
  RETRY: 'Tentar de novo',
  SHADOW_SEAL: 'modo sombra: o analista só observa',
  GOVERN_SEAL: 'o analista está decidindo',
  POSTURE: 'Postura',
  CLOSED_AT: 'Vela que fechou',
  FACT_CADENCE: 'Ritmo',
  FACT_SIZE: 'Tamanho',
  FACT_DURATION: 'Duração',
  TEAM_TITLE: 'Equipe do analista',
  LOCKS_TITLE: 'Travas',
  LOCK_ACTIVE: 'ativa',
  LOCK_FREE: 'livre',
  LOCK_NOT_APPLICABLE: 'não se aplica',
  NO_LOCKS: 'As travas aparecem quando o analista decide uma vela.',
  HISTORY_TITLE: 'Decisões do analista',
  HISTORY_EMPTY: 'O analista ainda não decidiu nenhuma vela.',
  HISTORY_LOADING: 'Carregando as decisões do analista…',
  HISTORY_ERROR: 'Não deu para carregar as decisões do analista agora.',
  MORE_OLDER: 'Ver decisões anteriores',
  FAILED_WORD: 'sem decisão',
  NO_FORECAST: 'Sem previsão',
  SEAT_WITHOUT_SPEECH: 'O analista não tem fala gravada para esta vela.',
} as const;

export type PostureLook = {
  readonly tone: ChipTone;
  readonly icon: IconName;
};

// Estado = ícone + palavra + cor: a palavra (PAUSA, CAUTELA, MODERADA, LIBERADA) vem do servidor.
export const POSTURE_LOOK: Readonly<Record<AnalystPosture, PostureLook>> = {
  pause: { tone: CHIP_TONE.WARN, icon: 'pause' },
  caution: { tone: CHIP_TONE.WARN, icon: 'alert' },
  normal: { tone: CHIP_TONE.INFO, icon: 'equal' },
  confident: { tone: CHIP_TONE.BUY, icon: 'check' },
};

export const FAILED_LOOK: PostureLook = { tone: CHIP_TONE.NEUTRAL, icon: 'info' };

export const CADENCE_TEXT: Readonly<Record<15 | 60 | 240, string>> = {
  15: 'a cada 15 min',
  60: 'a cada 1 hora',
  240: 'a cada 4 horas',
};

// O tamanho que o servidor escolheu (0, 0,25, 0,5 ou 1 do risco da estratégia); valor desconhecido aparece como veio.
export const SIZE_TEXT: Readonly<Record<string, string>> = {
  '0': 'nenhuma entrada nova',
  '0.25': '¼ do risco da estratégia',
  '0.5': '½ do risco da estratégia',
  '1': 'o risco inteiro da estratégia',
};

export const VERDICT_CHIP: Readonly<
  Record<'above' | 'even' | 'below' | 'too_few', { tone: ChipTone; icon: IconName }>
> = {
  above: { tone: CHIP_TONE.BUY, icon: 'check' },
  even: { tone: CHIP_TONE.NEUTRAL, icon: 'equal' },
  below: { tone: CHIP_TONE.SELL, icon: 'arrowDown' },
  too_few: { tone: CHIP_TONE.INFO, icon: 'info' },
};
