// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AvatarWho } from './pixel-avatar.js';

// As cinco vistas desenhadas; sudoeste, oeste e noroeste são o espelho de sudeste, leste e nordeste.
export type SpriteView = 's' | 'se' | 'e' | 'ne' | 'n';

// O que o braço da frente faz (o de trás acompanha a caminhada). `swing` é o balanço da caminhada.
export type ArmMode =
  | 'down'
  | 'swing'
  | 'point'
  | 'type'
  | 'reach'
  | 'press'
  | 'take'
  | 'hold'
  | 'raise'
  | 'sip'
  | 'blow'
  | 'burn'
  | 'tilt';

// As pernas: em pé, sentado, ou um dos 8 quadros da caminhada (4 por passada: contato, abaixado, passagem, alto; a
// segunda metade troca a perna da frente).
export type LegFrame = 'stand' | 'seat' | number;

export type Expression = 'plain' | 'closed' | 'squeeze' | 'shy' | 'puff';

export type SpriteSpec = {
  readonly view: SpriteView;
  readonly legs: LegFrame;
  // O tronco desce um pixel (quadro abaixado da caminhada, respiração).
  readonly drop: 0 | 1;
  readonly arm: ArmMode;
  // O lado do balanço: 1 = braço da frente para a frente, -1 = para trás.
  readonly swing: 1 | -1;
  readonly face: Expression;
  // Segundo quadro de digitar (as mãos trocam).
  readonly alt: boolean;
};

export type HairKind = 'short' | 'spiky' | 'bun' | 'long' | 'ponytail' | 'bald' | 'bob';

export type SpriteProfile = {
  readonly hair: HairKind;
  readonly glasses: boolean;
  readonly headphones: boolean;
  readonly headset: boolean;
  readonly beard: boolean;
  readonly sideTail: boolean;
  readonly badge: boolean;
};

const BASE: SpriteProfile = {
  hair: 'short',
  glasses: false,
  headphones: false,
  headset: false,
  beard: false,
  sideTail: false,
  badge: false,
};

// O que muda de pessoa para pessoa nas vistas de lado e de costas (a vista de frente usa o desenho aprovado de cada um).
export const PROFILES: Readonly<Record<AvatarWho, SpriteProfile>> = {
  tiago: { ...BASE, hair: 'spiky' },
  renata: { ...BASE, hair: 'bun', glasses: true },
  vitor: { ...BASE, headphones: true },
  sofia: { ...BASE, hair: 'long' },
  alice: { ...BASE, hair: 'ponytail', headset: true },
  otavio: { ...BASE, hair: 'bald', beard: true },
  nina: { ...BASE, hair: 'bob', glasses: true, badge: true },
  lucas: { ...BASE, beard: true, badge: true },
  olivia: { ...BASE, hair: 'bun', glasses: true, sideTail: true, badge: true },
};
