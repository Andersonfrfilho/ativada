// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { TeamFamily } from '../team-room.constant.js';

export const OFFICE_SCENE = {
  NEW_CANDLE: 'new_candle',
  BUY_SIGNAL: 'buy_signal',
  SELL_SIGNAL: 'sell_signal',
  LOCKED: 'locked',
} as const;

export type OfficeScene = (typeof OFFICE_SCENE)[keyof typeof OFFICE_SCENE];

// As fases da coreografia, em ordem. O estado final (`REST`) é o desenho em repouso: tudo no lugar, balões abertos.
export const OFFICE_PHASE = {
  WATCH: 'watch',
  RISE: 'rise',
  WALK: 'walk',
  DECIDE: 'decide',
  AUDIT: 'audit',
  SIGN: 'sign',
  SPEAK: 'speak',
  LOCK: 'lock',
} as const;

export type OfficePhase = (typeof OFFICE_PHASE)[keyof typeof OFFICE_PHASE];

export type OfficeStep = { readonly phase: OfficePhase; readonly at: number };
export type OfficePlan = {
  readonly steps: readonly OfficeStep[];
  // Quando a sequência acaba e o escritório volta ao repouso.
  readonly endsAt: number;
};

// Os tempos em milissegundos desde a vela nova; a caminhada dura `--motion-walk` (1750 ms) e vai e volta no mesmo quadro-chave.
export const OFFICE_PLANS: Readonly<Record<OfficeScene, OfficePlan>> = {
  [OFFICE_SCENE.NEW_CANDLE]: {
    steps: [
      { phase: OFFICE_PHASE.WATCH, at: 0 },
      { phase: OFFICE_PHASE.RISE, at: 300 },
      { phase: OFFICE_PHASE.WALK, at: 560 },
      { phase: OFFICE_PHASE.DECIDE, at: 1300 },
      { phase: OFFICE_PHASE.AUDIT, at: 1800 },
      { phase: OFFICE_PHASE.SPEAK, at: 2200 },
    ],
    endsAt: 2460,
  },
  [OFFICE_SCENE.BUY_SIGNAL]: {
    steps: [
      { phase: OFFICE_PHASE.WATCH, at: 0 },
      { phase: OFFICE_PHASE.RISE, at: 300 },
      { phase: OFFICE_PHASE.WALK, at: 560 },
      { phase: OFFICE_PHASE.DECIDE, at: 1300 },
      { phase: OFFICE_PHASE.AUDIT, at: 1700 },
      { phase: OFFICE_PHASE.SIGN, at: 1900 },
      { phase: OFFICE_PHASE.SPEAK, at: 2200 },
    ],
    endsAt: 2460,
  },
  [OFFICE_SCENE.SELL_SIGNAL]: {
    steps: [
      { phase: OFFICE_PHASE.WATCH, at: 0 },
      { phase: OFFICE_PHASE.RISE, at: 300 },
      { phase: OFFICE_PHASE.WALK, at: 560 },
      { phase: OFFICE_PHASE.DECIDE, at: 1300 },
      { phase: OFFICE_PHASE.AUDIT, at: 1700 },
      { phase: OFFICE_PHASE.SIGN, at: 1900 },
      { phase: OFFICE_PHASE.SPEAK, at: 2200 },
    ],
    endsAt: 2460,
  },
  [OFFICE_SCENE.LOCKED]: {
    steps: [
      { phase: OFFICE_PHASE.WATCH, at: 0 },
      { phase: OFFICE_PHASE.LOCK, at: 500 },
      { phase: OFFICE_PHASE.DECIDE, at: 900 },
      { phase: OFFICE_PHASE.AUDIT, at: 1400 },
      { phase: OFFICE_PHASE.SPEAK, at: 1700 },
    ],
    endsAt: 2000,
  },
};

export const OFFICE_LIMITS = {
  MAX_SEQUENCE_MILLISECONDS: 2500,
  MAX_ANIMATED_ELEMENTS: 60,
} as const;

// Movimento de ocioso: poucos segundos depois da sequência e para (nada em laço).
export const OFFICE_IDLE_MILLISECONDS = 6300;

// O atributo que marca cada elemento que se mexe, para a contagem do contrato e da medida no navegador.
export const ANIMATED_ATTRIBUTE = 'data-animated';

export const OFFICE_SEAT = {
  TREND: 'trend',
  REVERSION: 'reversion',
  VOLUME: 'volume',
  SENTIMENT: 'sentiment',
} as const satisfies Record<string, TeamFamily>;

export const OFFICE_DESK_FAMILIES: readonly TeamFamily[] = [
  OFFICE_SEAT.TREND,
  OFFICE_SEAT.REVERSION,
  OFFICE_SEAT.VOLUME,
  OFFICE_SEAT.SENTIMENT,
];

export const OFFICE_TEXT = {
  TITLE: 'Escritório da equipe',
  SHOW: 'Ver o escritório',
  HIDE: 'Esconder o escritório',
  NEXT_CLOSE: 'Próximo fechamento',
  BOARD: 'Quadro de avisos',
  SIGNAL: 'Sinal',
  LOCKS: 'Travas',
  LOCKS_UNKNOWN: 'travas: sem leitura',
  NO_SIGNAL: 'nenhum nesta vela',
  ALICE_TABLE: 'Mesa da Alice',
  ALICE_TABLE_NOTE: 'onde a equipe entrega a opinião',
  AUDITOR_CLIPBOARD: 'Prancheta · Wilson 95%',
  COFFEE: 'Café',
  MODELS_ROOM: 'Sala dos modelos · em breve',
  MODEL_TAG: 'MODELO',
  MODEL_NOTE: 'em breve',
  SCREEN_TITLE: 'Telão',
  SCREEN_CHART_NOTE: 'O gráfico completo está no cartão "Preço e operações".',
  ENTRY: 'entrada',
  TARGET: 'alvo',
  PROTECTION: 'proteção',
  NO_RULES: 'Esta estratégia não tem regras desta família.',
  POSTURE: 'Postura:',
  LOCK_ON: 'Trava ligada · sem compra nova',
  PAUSE: 'Pausar',
  RESUME: 'Continuar',
  BADGES: 'Crachás da equipe',
  STAGE_FOOTER:
    'Estado final sem animação: abertura da tela, animação desligada ou movimento reduzido.',
} as const;
