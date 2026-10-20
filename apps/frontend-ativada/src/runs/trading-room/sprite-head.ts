// Copyright (c) 2026 Ada Technology. All rights reserved.
import { dot, paintStrokes, type Painter, type Stroke } from './pixel-avatar.js';
import type { Expression, SpriteView } from './sprite-types.js';

// A cabeça em cada vista: de frente com os dois olhos, de frente na diagonal com o rosto virado um pixel, de lado com um
// olho, nariz e orelha, de costas na diagonal só com a bochecha e a orelha, e de costas só com as orelhas e a nuca.
const HEAD: Readonly<Record<SpriteView, readonly Stroke[]>> = {
  s: [
    [[5, 4, 10, 9], 'skin'],
    [[5, 12, 10, 1], 'skin-d'],
  ],
  se: [
    [[5, 4, 10, 9], 'skin'],
    [[5, 12, 10, 1], 'skin-d'],
    [[5, 8, 1, 2], 'skin-d'],
  ],
  e: [
    [[6, 4, 9, 9], 'skin'],
    [[6, 12, 9, 1], 'skin-d'],
    [[15, 9, 1, 2], 'skin'],
  ],
  ne: [
    [[5, 4, 10, 9], 'skin'],
    [[14, 8, 1, 3], 'skin-d'],
  ],
  n: [
    [[5, 4, 10, 9], 'skin'],
    [[4, 8, 1, 2], 'skin'],
    [[15, 8, 1, 2], 'skin'],
    [[7, 12, 6, 1], 'skin-d'],
  ],
};

type Face = {
  readonly eyes: readonly number[];
  readonly mouth: number;
  readonly blush: readonly number[];
};

// Onde ficam os olhos (colunas), a boca e as bochechas nas vistas que mostram o rosto.
const FACE: Readonly<Partial<Record<SpriteView, Face>>> = {
  s: { eyes: [7, 12], mouth: 9, blush: [6, 13] },
  se: { eyes: [8, 13], mouth: 10, blush: [7, 14] },
  e: { eyes: [12], mouth: 13, blush: [11] },
};

function eyesOf(face: Face, expression: Expression): readonly Stroke[] {
  if (expression === 'closed') return face.eyes.map((x) => [[x - 1, 9, 2, 1], 'eye'] as const);
  if (expression === 'squeeze') {
    return face.eyes.flatMap((x) => [dot(x, 8, 'eye'), dot(x + 1, 9, 'eye'), dot(x, 10, 'eye')]);
  }
  const row = expression === 'shy' ? 9 : 8;
  return face.eyes.map((x) => [[x, row, 1, 2], 'eye'] as const);
}

function mouthOf(face: Face, expression: Expression): readonly Stroke[] {
  if (expression === 'squeeze') return [[[face.mouth - 1, 11, 3, 1], 'mouth']];
  if (expression === 'puff') return [[[face.mouth + 1, 11, 1, 1], 'mouth']];
  return [[[face.mouth, 11, 2, 1], 'mouth']];
}

export function paintHead(paint: Painter, view: SpriteView): void {
  paintStrokes(paint, HEAD[view]);
}

// Olhos, boca e bochechas (vergonha = bochecha maior e olhar para baixo).
export function paintFace(paint: Painter, view: SpriteView, expression: Expression): void {
  const face = FACE[view];
  if (face === undefined) return;
  const blushWidth = expression === 'shy' ? 2 : 1;
  paintStrokes(paint, eyesOf(face, expression));
  paintStrokes(paint, mouthOf(face, expression));
  face.blush.forEach((x) => paint([x, 10, blushWidth, 1], 'blush'));
}

// A orelha de lado fica por cima do cabelo da nuca.
export function paintEar(paint: Painter, view: SpriteView): void {
  if (view === 'e') paint([9, 8, 1, 2], 'skin-d');
}
