// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AvatarWho, Box, Painter } from './pixel-avatar.js';

type Stroke = readonly [box: Box, color: string];

const dot = (x: number, y: number, color: string): Stroke => [[x, y, 1, 1], color];

// O losango roxo no peito do blazer: o que marca a equipe de modelo ◆.
const BADGE: readonly Stroke[] = [
  dot(11, 15, 'halo'),
  dot(10, 16, 'halo'),
  dot(12, 16, 'halo'),
  dot(11, 17, 'halo'),
];

// O adereço de cada um (o que faz a silhueta); as equipes ◆ são pessoas de blazer roxo com o losango no peito.
const STYLE: Readonly<Record<AvatarWho, readonly Stroke[]>> = {
  tiago: [
    [[4, 3, 10, 3], 'hair'],
    [[4, 6, 1, 2], 'hair'],
    [[10, 2, 4, 1], 'hair'],
    [[12, 1, 3, 1], 'hair'],
    dot(15, 0, 'hair'),
    dot(7, 17, 'pin'),
    dot(8, 16, 'pin'),
    dot(9, 16, 'pin'),
    dot(10, 17, 'pin'),
  ],
  renata: [
    [[7, 0, 4, 3], 'hair'],
    [[4, 3, 10, 3], 'hair'],
    [[4, 6, 1, 3], 'hair'],
    [[13, 6, 1, 3], 'hair'],
    [[5, 7, 3, 1], 'frame'],
    [[10, 7, 3, 1], 'frame'],
    [[8, 8, 2, 1], 'frame'],
  ],
  vitor: [
    [[4, 3, 10, 2], 'hair'],
    [[3, 2, 12, 1], 'acc'],
    [[2, 3, 1, 3], 'acc'],
    [[15, 3, 1, 3], 'acc'],
    [[1, 6, 3, 4], 'acc'],
    [[14, 6, 3, 4], 'acc'],
  ],
  sofia: [
    [[4, 3, 10, 3], 'hair'],
    [[9, 5, 4, 1], 'hair'],
    dot(8, 17, 'heart'),
    dot(9, 17, 'heart'),
    dot(8, 18, 'heart'),
  ],
  alice: [
    [[4, 3, 10, 3], 'hair'],
    [[4, 6, 1, 5], 'hair'],
    [[13, 6, 1, 5], 'hair'],
    [[14, 1, 2, 2], 'hair'],
    [[15, 3, 2, 4], 'hair'],
    [[2, 7, 2, 3], 'acc'],
    dot(4, 11, 'acc'),
    dot(5, 11, 'acc'),
    dot(7, 16, 'gold'),
    [[6, 17, 3, 1], 'gold'],
    dot(7, 18, 'gold'),
  ],
  otavio: [
    [[4, 6, 1, 3], 'hair'],
    [[13, 6, 1, 3], 'hair'],
    [[6, 12, 6, 1], 'hair'],
    [[14, 13, 1, 4], 'gold'],
    [[14, 10, 4, 1], 'gold'],
    [[14, 13, 4, 1], 'gold'],
    [[17, 10, 1, 4], 'gold'],
    [[15, 11, 2, 2], 'glass'],
  ],
  nina: [
    [[4, 3, 10, 3], 'hair'],
    [[4, 6, 1, 5], 'hair'],
    [[13, 6, 1, 5], 'hair'],
    [[5, 6, 3, 1], 'hair'],
    [[5, 7, 3, 1], 'frame'],
    [[10, 7, 3, 1], 'frame'],
    [[8, 8, 2, 1], 'frame'],
    ...BADGE,
  ],
  lucas: [
    [[4, 3, 10, 2], 'hair'],
    [[9, 2, 5, 1], 'hair'],
    [[4, 5, 1, 2], 'hair'],
    [[6, 12, 6, 1], 'hair'],
    [[4, 10, 1, 2], 'hair'],
    [[13, 10, 1, 2], 'hair'],
    dot(8, 14, 'pin'),
    dot(9, 14, 'pin'),
    ...BADGE,
  ],
  olivia: [
    [[4, 3, 10, 3], 'hair'],
    [[7, 0, 4, 3], 'hair'],
    [[4, 6, 1, 2], 'hair'],
    [[14, 4, 2, 9], 'hair'],
    [[15, 13, 1, 3], 'hair'],
    [[5, 7, 3, 2], 'frame'],
    [[10, 7, 3, 2], 'frame'],
    dot(8, 8, 'frame'),
    dot(9, 8, 'frame'),
    dot(8, 14, 'pin'),
    dot(9, 14, 'pin'),
    ...BADGE,
  ],
};

export function paintStyle(paint: Painter, who: AvatarWho): void {
  STYLE[who].forEach(([box, color]) => paint(box, color));
}

// O cabelo longo da Sofia fica ATRÁS do corpo: é pintado antes de tudo.
export function paintBackHair(paint: Painter, who: AvatarWho): void {
  if (who !== 'sofia') return;
  paint([2, 4, 2, 13], 'hair');
  paint([14, 4, 2, 13], 'hair');
}

export function paintBody(paint: Painter): void {
  paint([5, 14, 8, 8], 'cloth');
  paint([12, 14, 1, 8], 'cloth-d');
  paint([3, 15, 2, 6], 'cloth-d');
  paint([3, 21, 2, 1], 'skin');
  paint([8, 13, 2, 1], 'skin-d');
}

export function paintHead(paint: Painter): void {
  paint([4, 4, 10, 9], 'skin');
  paint([4, 12, 10, 1], 'skin-d');
  [dot(6, 8, 'eye'), dot(6, 9, 'eye'), dot(11, 8, 'eye'), dot(11, 9, 'eye')].forEach(([b, c]) =>
    paint(b, c),
  );
  paint([8, 11, 2, 1], 'mouth');
  paint([5, 10, 1, 1], 'blush');
  paint([12, 10, 1, 1], 'blush');
}

export function paintLegs(paint: Painter, isStep: boolean): void {
  paint([6, 22, 2, isStep ? 3 : 4], 'pants');
  paint([5, isStep ? 25 : 26, 3, 1], 'shoe');
  paint([10, 22, 2, 4], 'pants');
  paint([10, 26, 3, 1], 'shoe');
}

export type ArmMode = 'down' | 'up' | 'hold' | 'sip' | 'burn' | 'blow' | 'tilt';

// A caneca: três por três com o café por cima e a alça do lado de fora.
function paintMug(paint: Painter, x: number, y: number): void {
  paint([x, y, 3, 3], 'cup');
  paint([x, y, 3, 1], 'coffee');
  paint([x + 3, y + 1, 1, 1], 'cup');
}

// Os fiapos de vapor sobre a caneca; ao queimar a língua saem mais.
function paintSteam(paint: Painter, isHot: boolean): void {
  paint([15, 6, 1, 1], 'steam');
  paint([16, 5, 1, 1], 'steam');
  if (isHot) paint([14, 5, 1, 1], 'steam');
}

// A língua vermelha de quem queimou, embaixo da boca (pintada depois da cabeça).
export function paintTongue(paint: Painter): void {
  paint([8, 12, 2, 1], 'tongue');
}

export function paintArm(paint: Painter, mode: ArmMode): void {
  if (mode === 'up') {
    paint([13, 7, 2, 8], 'cloth-d');
    paint([13, 6, 2, 1], 'skin');
    return;
  }
  if (mode === 'sip' || mode === 'burn' || mode === 'blow') {
    paint([13, 12, 2, 5], 'cloth-d');
    paint([13, 11, 2, 1], 'skin');
    paintMug(paint, 14, 8);
    if (mode !== 'sip') paintSteam(paint, mode === 'burn');
    return;
  }
  if (mode === 'tilt') {
    paint([13, 15, 2, 4], 'cloth-d');
    paint([13, 19, 2, 1], 'skin');
    paint([15, 18, 3, 2], 'cup');
    paint([17, 20, 1, 2], 'coffee');
    paint([16, 23, 1, 1], 'coffee');
    return;
  }
  paint([13, 15, 2, mode === 'hold' ? 4 : 6], 'cloth-d');
  paint([13, mode === 'hold' ? 19 : 21, 2, 1], 'skin');
  if (mode === 'hold') paintMug(paint, 14, 17);
}
