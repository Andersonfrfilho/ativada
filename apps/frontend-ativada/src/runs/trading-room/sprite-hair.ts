// Copyright (c) 2026 Ada Technology. All rights reserved.
import { dot, paintStrokes, type Painter, type Stroke } from './pixel-avatar.js';
import type { HairKind, SpriteProfile } from './sprite-types.js';

// O cabelo de lado (olhando para a direita) e de costas: a nuca e o alto da cabeça são cabelo; de costas o rosto não aparece.
type BackView = 'e' | 'ne' | 'n';

const CAP: Readonly<Record<BackView, readonly Stroke[]>> = {
  e: [
    [[6, 3, 9, 2], 'hair'],
    [[6, 5, 3, 5], 'hair'],
    [[13, 5, 2, 1], 'hair'],
  ],
  ne: [
    [[5, 3, 10, 3], 'hair'],
    [[5, 6, 9, 5], 'hair'],
  ],
  n: [
    [[5, 3, 10, 9], 'hair'],
    [[6, 11, 8, 1], 'hair'],
  ],
};

const BALD: Readonly<Record<BackView, readonly Stroke[]>> = {
  e: [[[6, 7, 3, 3], 'hair']],
  ne: [[[5, 7, 9, 3], 'hair']],
  n: [[[5, 7, 10, 3], 'hair']],
};

const EXTRA: Readonly<Record<HairKind, Readonly<Record<BackView, readonly Stroke[]>>>> = {
  short: { e: [], ne: [], n: [] },
  spiky: {
    e: [[[12, 2, 3, 1], 'hair'], dot(15, 1, 'hair')],
    ne: [[[10, 2, 4, 1], 'hair'], [[12, 1, 3, 1], 'hair'], dot(15, 0, 'hair')],
    n: [[[10, 2, 4, 1], 'hair'], [[12, 1, 3, 1], 'hair'], dot(15, 0, 'hair')],
  },
  bun: {
    e: [[[6, 0, 4, 3], 'hair']],
    ne: [[[8, 0, 4, 3], 'hair']],
    n: [[[8, 0, 4, 3], 'hair']],
  },
  long: {
    e: [[[5, 5, 4, 12], 'hair']],
    ne: [[[4, 4, 11, 13], 'hair']],
    n: [[[4, 4, 12, 13], 'hair']],
  },
  ponytail: {
    e: [
      [[3, 5, 3, 7], 'hair'],
      [[15, 1, 2, 2], 'hair'],
    ],
    ne: [[[8, 11, 3, 6], 'hair']],
    n: [[[9, 11, 2, 6], 'hair']],
  },
  bald: { e: [], ne: [], n: [] },
  bob: {
    e: [
      [[6, 5, 3, 6], 'hair'],
      [[13, 5, 2, 3], 'hair'],
    ],
    ne: [[[5, 4, 10, 8], 'hair']],
    n: [[[5, 4, 10, 8], 'hair']],
  },
};

function accessoriesOf(profile: SpriteProfile, view: BackView): readonly Stroke[] {
  const strokes: Stroke[] = [];
  if (profile.headphones && view === 'e')
    strokes.push([[7, 2, 6, 1], 'acc'], [[8, 6, 3, 4], 'acc']);
  if (profile.headphones && view !== 'e') {
    strokes.push([[4, 2, 12, 1], 'acc'], [[3, 6, 2, 4], 'acc'], [[15, 6, 2, 4], 'acc']);
  }
  if (profile.headset && view === 'e') strokes.push([[9, 7, 2, 3], 'acc'], [[11, 11, 3, 1], 'acc']);
  if (profile.headset && view !== 'e') strokes.push([[15, 7, 2, 3], 'acc']);
  if (profile.glasses && view === 'e')
    strokes.push([[11, 7, 4, 1], 'frame'], [[9, 7, 2, 1], 'frame']);
  if (profile.beard && view === 'e')
    strokes.push([[11, 12, 4, 1], 'hair'], [[10, 10, 1, 2], 'hair']);
  if (profile.sideTail && view !== 'e')
    strokes.push([[3, 4, 2, 9], 'hair'], [[3, 13, 1, 3], 'hair']);
  if (profile.badge && view === 'e') strokes.push(dot(12, 16, 'halo'));
  return strokes;
}

// O cabelo e os adereços de quem olha de lado ou de costas.
export function paintBackHair(paint: Painter, profile: SpriteProfile, view: BackView): void {
  const base = profile.hair === 'bald' ? BALD[view] : CAP[view];
  paintStrokes(paint, base);
  paintStrokes(paint, EXTRA[profile.hair][view]);
  paintStrokes(paint, accessoriesOf(profile, view));
}

// Cabelo longo fica atrás do corpo de lado: pintado antes do tronco.
export function paintHairBehind(paint: Painter, profile: SpriteProfile, view: BackView): void {
  if (profile.hair === 'long' && view === 'e') paint([5, 9, 4, 8], 'hair');
  if (profile.hair === 'ponytail' && view === 'e') paint([3, 9, 3, 3], 'hair');
}
