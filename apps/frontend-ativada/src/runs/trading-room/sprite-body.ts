// Copyright (c) 2026 Ada Technology. All rights reserved.
import { paintStrokes, type Painter, type Stroke } from './pixel-avatar.js';
import type { LegFrame, SpriteView } from './sprite-types.js';

// O tronco em cada vista (de lado é mais estreito) e as pernas: em pé, sentado e os 8 quadros da caminhada.
const TORSO: Readonly<Record<SpriteView, readonly Stroke[]>> = {
  s: [
    [[6, 14, 8, 8], 'cloth'],
    [[13, 14, 1, 8], 'cloth-d'],
    [[9, 13, 2, 1], 'skin-d'],
  ],
  se: [
    [[6, 14, 8, 8], 'cloth'],
    [[6, 14, 1, 8], 'cloth-d'],
    [[10, 13, 2, 1], 'skin-d'],
  ],
  e: [
    [[7, 14, 6, 8], 'cloth'],
    [[7, 14, 1, 8], 'cloth-d'],
    [[9, 13, 2, 1], 'skin-d'],
  ],
  ne: [
    [[6, 14, 8, 8], 'cloth'],
    [[13, 14, 1, 8], 'cloth-d'],
    [[8, 14, 4, 1], 'cloth-d'],
  ],
  n: [
    [[6, 14, 8, 8], 'cloth'],
    [[6, 14, 1, 8], 'cloth-d'],
    [[13, 14, 1, 8], 'cloth-d'],
    [[8, 14, 4, 1], 'cloth-d'],
  ],
};

export function paintTorso(paint: Painter, view: SpriteView): void {
  paintStrokes(paint, TORSO[view]);
}

type Leg = { readonly length: number; readonly shoe: number; readonly toe: number };

// De frente (e de costas): a perna levantada fica mais curta. Contato, abaixado, passagem e alto.
const FRONT_WALK: readonly (readonly [lead: Leg, trail: Leg])[] = [
  [
    { length: 4, shoe: 26, toe: 0 },
    { length: 3, shoe: 25, toe: 0 },
  ],
  [
    { length: 3, shoe: 26, toe: 0 },
    { length: 2, shoe: 25, toe: 0 },
  ],
  [
    { length: 4, shoe: 26, toe: 0 },
    { length: 2, shoe: 24, toe: 0 },
  ],
  [
    { length: 4, shoe: 26, toe: 0 },
    { length: 3, shoe: 25, toe: 1 },
  ],
];

function frontLeg(x: number, leg: Leg, isDiagonal: boolean): readonly Stroke[] {
  const top = leg.shoe - leg.length;
  const shoeX = x - 1 + (isDiagonal ? 1 : 0) + leg.toe;
  return [
    [[x, top, 2, leg.length], 'pants'],
    [[shoeX, leg.shoe, 3, 1], 'shoe'],
  ];
}

function frontLegs(frame: LegFrame, view: SpriteView): readonly Stroke[] {
  const isDiagonal = view === 'se' || view === 'ne';
  if (frame === 'seat') {
    return [
      [[7, 22, 2, 2], 'pants'],
      [[11, 22, 2, 2], 'pants'],
      [[6, 24, 3, 1], 'shoe'],
      [[11, 24, 3, 1], 'shoe'],
    ];
  }
  const stand: Leg = { length: 4, shoe: 26, toe: 0 };
  const [lead, trail] =
    frame === 'stand' ? [stand, stand] : (FRONT_WALK[frame % 4] ?? [stand, stand]);
  const isLeftLead = frame === 'stand' || frame < 4;
  return [
    ...frontLeg(7, isLeftLead ? lead : trail, isDiagonal),
    ...frontLeg(11, isLeftLead ? trail : lead, isDiagonal),
  ];
}

// De lado: a perna da frente avança e a de trás recua; na passagem uma sobe. A perna de longe é mais escura.
const SIDE_WALK: readonly (readonly [lead: readonly Stroke[], trail: readonly Stroke[]])[] = [
  [
    [
      [[10, 22, 2, 2], 'p'],
      [[11, 24, 2, 2], 'p'],
      [[11, 26, 4, 1], 'shoe'],
    ],
    [
      [[8, 22, 2, 2], 'p'],
      [[7, 24, 2, 2], 'p'],
      [[6, 26, 3, 1], 'shoe'],
    ],
  ],
  [
    [
      [[10, 23, 2, 2], 'p'],
      [[11, 25, 2, 1], 'p'],
      [[11, 26, 4, 1], 'shoe'],
    ],
    [
      [[8, 23, 2, 2], 'p'],
      [[7, 25, 2, 1], 'p'],
      [[6, 26, 3, 1], 'shoe'],
    ],
  ],
  [
    [
      [[9, 22, 2, 4], 'p'],
      [[9, 26, 4, 1], 'shoe'],
    ],
    [
      [[10, 22, 2, 2], 'p'],
      [[11, 24, 2, 1], 'p'],
      [[11, 25, 3, 1], 'shoe'],
    ],
  ],
  [
    [
      [[8, 22, 2, 4], 'p'],
      [[8, 26, 4, 1], 'shoe'],
    ],
    [
      [[10, 22, 2, 2], 'p'],
      [[12, 23, 2, 2], 'p'],
      [[13, 24, 3, 1], 'shoe'],
    ],
  ],
];

function tint(strokes: readonly Stroke[], pants: string): readonly Stroke[] {
  return strokes.map(([box, color]) => [box, color === 'p' ? pants : color] as const);
}

function sideLegs(frame: LegFrame): readonly Stroke[] {
  if (typeof frame !== 'number') {
    return [
      [[8, 22, 2, 4], 'pants-d'],
      [[10, 22, 2, 4], 'pants'],
      [[8, 26, 3, 1], 'shoe'],
      [[10, 26, 4, 1], 'shoe'],
    ];
  }
  const [lead, trail] = SIDE_WALK[frame % 4] ?? [[], []];
  const isNearLead = frame < 4;
  return [
    ...tint(trail, isNearLead ? 'pants-d' : 'pants'),
    ...tint(lead, isNearLead ? 'pants' : 'pants-d'),
  ];
}

export function paintLegs(paint: Painter, view: SpriteView, frame: LegFrame): void {
  paintStrokes(paint, view === 'e' ? sideLegs(frame) : frontLegs(frame, view));
}
