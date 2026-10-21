// Copyright (c) 2026 Ada Technology. All rights reserved.
import { dot, type Stroke } from './pixel-avatar.js';
import type { ArmMode } from './sprite-types.js';

// O braço da pausa do café, de lado (olhando para a direita; o oeste é o espelho) e de frente. A caneca tem 4 × 4 pixels
// com o café por cima e a alça; o vapor é um pixel que sobe (a cor `steam` anima com movimento).
type CoffeeMode = Exclude<ArmMode, 'down' | 'swing' | 'point' | 'type'>;

const mug = (x: number, y: number, handle: number): readonly Stroke[] => [
  [[x, y, 4, 4], 'cup'],
  [[x, y, 4, 1], 'coffee'],
  [[handle, y + 1, 1, 2], 'cup'],
];

const steam = (points: readonly (readonly [number, number])[]): readonly Stroke[] =>
  points.map(([x, y]) => dot(x, y, 'steam'));

const limb = (boxes: readonly (readonly [number, number, number, number])[]): readonly Stroke[] =>
  boxes.map((box) => [box, 'cloth-d'] as const);

const hand = (x: number, y: number): Stroke => [[x, y, 2, 2], 'skin'];

const SIDE: Readonly<Record<CoffeeMode, readonly Stroke[]>> = {
  reach: [
    ...limb([
      [10, 15, 3, 2],
      [13, 15, 3, 2],
    ]),
    hand(16, 15),
  ],
  press: [
    ...limb([
      [10, 14, 2, 2],
      [12, 12, 2, 2],
    ]),
    hand(14, 10),
    [[16, 10, 4, 1], 'skin'],
  ],
  take: [
    ...limb([
      [10, 16, 3, 2],
      [13, 17, 3, 2],
    ]),
    [[16, 17, 2, 3], 'skin'],
  ],
  hold: [
    ...limb([
      [9, 15, 2, 3],
      [11, 17, 3, 2],
    ]),
    ...mug(15, 15, 19),
    hand(13, 17),
  ],
  raise: [
    ...limb([
      [10, 15, 2, 2],
      [12, 13, 2, 2],
    ]),
    ...mug(15, 10, 19),
    hand(13, 11),
  ],
  sip: [
    ...limb([
      [10, 15, 2, 2],
      [12, 13, 2, 2],
    ]),
    ...mug(14, 9, 18),
    hand(12, 11),
  ],
  blow: [
    ...limb([
      [10, 15, 2, 2],
      [12, 14, 2, 2],
    ]),
    ...mug(16, 11, 15),
    hand(14, 12),
    ...steam([
      [17, 9],
      [18, 8],
      [19, 7],
      [16, 8],
    ]),
  ],
  burn: [
    ...limb([
      [9, 15, 2, 3],
      [11, 17, 3, 2],
    ]),
    ...mug(15, 15, 19),
    hand(13, 17),
    [[14, 11, 2, 2], 'tongue'],
    ...steam([
      [16, 13],
      [17, 12],
      [16, 11],
      [18, 10],
    ]),
  ],
  tilt: [
    ...limb([
      [10, 16, 3, 2],
      [13, 18, 2, 2],
    ]),
    hand(15, 19),
    [[16, 20, 4, 3], 'cup'],
    [[16, 22, 4, 1], 'coffee'],
    [[18, 23, 1, 3], 'coffee'],
    [[15, 27, 5, 1], 'coffee'],
  ],
};

const FRONT: Readonly<Record<CoffeeMode, readonly Stroke[]>> = {
  reach: [
    ...limb([
      [14, 15, 2, 3],
      [15, 17, 2, 2],
    ]),
    hand(16, 18),
  ],
  press: [
    ...limb([
      [14, 13, 2, 3],
      [15, 11, 2, 2],
    ]),
    hand(16, 10),
  ],
  take: [
    ...limb([
      [14, 15, 2, 3],
      [15, 17, 2, 2],
    ]),
    hand(16, 18),
  ],
  hold: [...limb([[14, 15, 2, 3]]), ...mug(16, 16, 15), hand(14, 18)],
  raise: [
    ...limb([
      [14, 15, 2, 2],
      [13, 13, 2, 2],
    ]),
    ...mug(12, 10, 16),
    [[12, 13, 2, 1], 'skin'],
  ],
  sip: [
    ...limb([
      [14, 15, 2, 2],
      [13, 13, 2, 2],
    ]),
    ...mug(8, 9, 12),
    [[12, 11, 1, 2], 'skin'],
  ],
  blow: [
    ...limb([
      [14, 15, 2, 2],
      [13, 14, 2, 2],
    ]),
    ...mug(9, 13, 13),
    [[12, 15, 1, 2], 'skin'],
    ...steam([
      [10, 11],
      [12, 10],
      [13, 9],
      [11, 8],
    ]),
  ],
  burn: [
    ...limb([[14, 15, 2, 3]]),
    ...mug(16, 16, 15),
    hand(14, 18),
    [[9, 12, 2, 2], 'tongue'],
    ...steam([
      [17, 14],
      [18, 13],
      [17, 12],
      [18, 11],
      [16, 12],
    ]),
    dot(4, 5, 'sweat'),
    dot(4, 6, 'sweat'),
  ],
  tilt: [
    ...limb([[14, 15, 2, 4]]),
    hand(15, 19),
    [[16, 20, 4, 3], 'cup'],
    [[16, 22, 4, 1], 'coffee'],
    [[18, 23, 1, 3], 'coffee'],
    [[14, 27, 6, 1], 'coffee'],
  ],
};

export const COFFEE_ARMS: Readonly<
  Record<'side' | 'front', Readonly<Record<CoffeeMode, readonly Stroke[]>>>
> = {
  side: SIDE,
  front: FRONT,
};

// De lado, durante a pausa, o braço de longe fica escondido atrás do corpo.
export const FAR_ARM_SIDE: readonly Stroke[] = [];
