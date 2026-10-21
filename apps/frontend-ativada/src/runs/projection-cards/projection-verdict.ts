// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { IconName } from '../../layout/Icon.component.js';
import type { ProjectionSummary } from '../candle-chart/projections.validation.js';

export type VerdictTone = 'buy' | 'sell' | 'neutral';

export type VerdictLook = {
  readonly icon: IconName;
  readonly word: string;
  readonly tone: VerdictTone;
};

// O veredito é ícone + palavra + cor (nunca só cor). A frase longa é do servidor (D8); aqui só a palavra curta de cada caso.
export const VERDICT_LOOK: Readonly<Record<ProjectionSummary['verdict'], VerdictLook>> = {
  above: { icon: 'check', word: 'Acima da moeda ao ar', tone: 'buy' },
  even: { icon: 'equal', word: 'Igual à moeda ao ar', tone: 'neutral' },
  below: { icon: 'arrowDown', word: 'Abaixo da moeda ao ar', tone: 'sell' },
  too_few: { icon: 'info', word: 'Poucas previsões', tone: 'neutral' },
};

export const STRENGTH_LABEL = {
  weak: 'Fraco',
  strong: 'Forte',
  decided: 'Decidiu',
} as const;

// A referência fixa do histórico: acertar o lado ao acaso é 50% (moeda ao ar).
export const COIN_FLIP_PERCENT = '50,00%';
export const COIN_FLIP_ATTRIBUTE = '50';
