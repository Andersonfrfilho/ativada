// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ArtRect } from './room-art.js';

// A mesa de operações de cada agente (viewBox 72 × 44): dois monitores e um notebook com gráfico, livro de ofertas, mapa
// de calor ou notícias, teclado, caneca, luminária e headset. A cor do monitor de gráfico segue a intenção (`--desk-tone`).
export type ScreenKind = 'chart' | 'book' | 'heat' | 'news';
export type DeskSide = 'left' | 'right';

type Quad = readonly [x: number, y: number, w: number, h: number];

const r = ([x, y, w, h]: Quad, fill: string): ArtRect => ({ x, y, w, h, fill });

const SCREEN: Readonly<Record<ScreenKind, () => readonly ArtRect[]>> = {
  chart: () =>
    [3, 5, 4, 7, 9, 11].map((h, i) =>
      r([2 + i * 2.6, 13 - h, 1.6, h * 0.7], i % 2 === 0 ? '--screen-bad' : '--desk-tone'),
    ),
  book: () =>
    [0, 1, 2, 3].flatMap((i) => [
      r([2, 2 + i * 2.6, 7 - i, 1.6], '--screen-bad'),
      r([10 + i, 2 + i * 2.6, 6 - i, 1.6], '--screen-good'),
    ]),
  heat: () =>
    Array.from({ length: 9 }, (_, i) =>
      r(
        [2 + (i % 3) * 5, 2 + Math.floor(i / 3) * 3.6, 4.4, 3],
        i % 3 === 1 ? '--screen-bad' : '--screen-good',
      ),
    ),
  news: () =>
    [14, 10, 12, 8].map((w, i) =>
      r([2, 2.4 + i * 2.6, w, 1.2], i === 0 ? '--terminal-warn' : '--screen-ink-2'),
    ),
};

function shift(rects: readonly ArtRect[], dx: number, dy: number): readonly ArtRect[] {
  return rects.map((rect) => ({ ...rect, x: rect.x + dx, y: rect.y + dy }));
}

function monitor(x: number, kind: ScreenKind): readonly ArtRect[] {
  const frame = [r([0, 0, 19, 15], '--room-monitor'), r([1, 1, 17, 12], '--screen')];
  const stand = [r([8, 15, 3, 3], '--room-monitor'), r([5, 17, 9, 1], '--room-monitor')];
  return shift([...frame, ...SCREEN[kind](), ...stand], x, 0);
}

function laptop(x: number, kind: ScreenKind): readonly ArtRect[] {
  const small = SCREEN[kind]().map((rect) => ({
    ...rect,
    x: rect.x * 0.55,
    y: rect.y * 0.55,
    w: rect.w * 0.55,
    h: rect.h * 0.55,
  }));
  return shift(
    [
      r([0, 0, 12, 7], '--room-monitor'),
      r([1, 1, 10, 5], '--screen'),
      ...small,
      r([-1, 7, 14, 2], '--room-keyboard'),
    ],
    x,
    10,
  );
}

export function buildDeskArt(
  side: DeskSide,
  kinds: readonly [ScreenKind, ScreenKind, ScreenKind],
): readonly ArtRect[] {
  const isRight = side === 'right';
  const keyboardX = isRight ? 12 : 44;
  return [
    ...monitor(isRight ? 32 : 1, kinds[0]),
    ...monitor(isRight ? 52 : 21, kinds[1]),
    r([0, 16, 72, 6], '--room-desk-top'),
    r([0, 16, 72, 1], '--room-desk-top-light'),
    ...laptop(isRight ? 1 : 58, kinds[2]),
    r([keyboardX, 18, 14, 2], '--room-keyboard'),
    r([keyboardX + 16, 18, 3, 2], '--room-keyboard'),
    r([isRight ? 26 : 40, 14, 3, 4], '--room-mug'),
    ...shift(
      [r([1, 0, 6, 3], '--room-lamp-shade'), r([3, 3, 1, 10], '--room-metal')],
      isRight ? 4 : 64,
      3,
    ),
    r([isRight ? 21 : 37, 17, 4, 2], '--room-headset'),
    r([0, 22, 72, 22], '--room-desk-front'),
    r([0, 22, 72, 2], '--room-desk-front-dark'),
  ];
}

export function buildLecternArt(): readonly ArtRect[] {
  return [
    r([0, 4, 32, 6], '--room-desk-top'),
    r([4, 10, 24, 28], '--room-desk-front'),
    r([10, 16, 12, 3], '--px-gold'),
    r([2, 38, 28, 2], '--room-desk-front-dark'),
  ];
}
