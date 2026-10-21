// Copyright (c) 2026 Ada Technology. All rights reserved.
import { dot, shiftPainter, type AvatarWho, type Painter, type Stroke } from './pixel-avatar.js';
import type { SpriteView } from './sprite-types.js';

// O losango roxo no peito do blazer: o que marca a equipe de modelo ◆.
const BADGE: readonly Stroke[] = [
  dot(11, 15, 'halo'),
  dot(10, 16, 'halo'),
  dot(12, 16, 'halo'),
  dot(11, 17, 'halo'),
];

// O adereço de cada um na vista de frente (o desenho aprovado, numa grade de 18 que entra na de 20 com um pixel de margem);
// as equipes ◆ são pessoas de blazer roxo com o losango no peito.
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

// De frente na diagonal o rosto vira um pixel para a direita: óculos e losango acompanham os olhos.
export function paintFrontStyle(paint: Painter, who: AvatarWho, view: SpriteView): void {
  const framed = shiftPainter(paint, 1, 0);
  const turned = shiftPainter(paint, 2, 0);
  STYLE[who].forEach(([box, color]) => {
    const isTurning = view === 'se' && (color === 'frame' || color === 'halo' || color === 'pin');
    (isTurning ? turned : framed)(box, color);
  });
}

// O cabelo longo da Sofia fica ATRÁS do corpo nas vistas de frente: é pintado antes de tudo.
export function paintFrontBackHair(paint: Painter, who: AvatarWho): void {
  if (who !== 'sofia') return;
  paint([3, 4, 2, 13], 'hair');
  paint([15, 4, 2, 13], 'hair');
}
