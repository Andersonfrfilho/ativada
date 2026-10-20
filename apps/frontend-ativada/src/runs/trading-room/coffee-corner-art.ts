// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ArtRect } from './room-art.js';

// O canto do café em pixel art ORIGINAL (unidades do piso; 4 unidades = 1 pixel da sala): balcão no chão do canto de cima à
// esquerda, a máquina de espresso na ponta direita dele (reservatório de grãos, visor, botão, bico, bandeja), duas canecas
// e um pote de açúcar no balcão e o quadrinho do café na parede. O que muda com o uso (botão aceso, café pingando, vapor,
// caneca no bico) vem de `buildCoffeeFx`.
type Quad = readonly [x: number, y: number, w: number, h: number];

const r = ([x, y, w, h]: Quad, fill: string): ArtRect => ({ x, y, w, h, fill });

const COUNTER: readonly ArtRect[] = [
  r([0, 520, 160, 8], '--room-counter-top'),
  r([0, 528, 160, 24], '--room-counter'),
  r([0, 552, 160, 4], '--room-counter-dark'),
  r([78, 530, 4, 22], '--room-counter-dark'),
  r([68, 538, 4, 4], '--room-metal'),
  r([88, 538, 4, 4], '--room-metal'),
];

const mug = (x: number): readonly ArtRect[] => [
  r([x, 504, 16, 16], '--room-cup'),
  r([x + 2, 504, 12, 4], '--room-cup-dark'),
  r([x + 16, 508, 4, 8], '--room-cup'),
];

const SHELF: readonly ArtRect[] = [
  ...mug(6),
  ...mug(32),
  r([60, 500, 16, 20], '--px-glass'),
  r([60, 496, 16, 4], '--room-metal'),
];

const POSTER: readonly ArtRect[] = [
  r([16, 372, 48, 44], '--room-baseboard'),
  r([20, 376, 40, 36], '--room-plate'),
  r([28, 394, 18, 14], '--room-cup'),
  r([46, 398, 4, 6], '--room-cup'),
  r([32, 382, 4, 8], '--room-steam'),
  r([40, 380, 4, 8], '--room-steam'),
];

const MACHINE: readonly ArtRect[] = [
  r([104, 400, 28, 20], '--px-glass'),
  r([108, 408, 20, 12], '--room-coffee'),
  r([84, 420, 76, 8], '--room-machine-top'),
  r([88, 428, 68, 92], '--room-machine'),
  r([88, 428, 6, 92], '--room-machine-dark'),
  r([98, 436, 36, 16], '--screen'),
  r([102, 440, 20, 4], '--screen-good'),
  r([102, 446, 12, 2], '--screen-ink-2'),
  r([108, 460, 28, 8], '--room-metal'),
  r([118, 468, 8, 6], '--room-machine-dark'),
  r([100, 474, 36, 42], '--room-machine-dark'),
  r([100, 512, 36, 8], '--room-metal'),
  ...[104, 112, 120, 128].map((x) => r([x, 514, 4, 2], '--room-machine-dark')),
  r([136, 474, 16, 14], '--room-metal'),
  r([140, 477, 8, 8], '--room-button'),
];

export function buildCoffeeCorner(): readonly ArtRect[] {
  return [...POSTER, ...COUNTER, ...SHELF, ...MACHINE];
}

export type CoffeeFxLook = 'idle' | 'pressing' | 'brewing' | 'ready';

const CUP_IN_BAY: readonly ArtRect[] = [
  r([112, 496, 16, 16], '--room-cup'),
  r([112, 496, 16, 4], '--room-coffee'),
  r([128, 500, 4, 8], '--room-cup'),
];

const steam = (quads: readonly Quad[]): readonly ArtRect[] =>
  quads.map((quad) => ({ ...r(quad, '--room-steam'), motion: 'steam' as const }));

const LIT: ArtRect = r([140, 477, 8, 8], '--room-button-on');

// O que muda na máquina: o botão aceso (pisca enquanto alguém aperta), o café pingando do bico na caneca com vapor, e a
// caneca pronta esperando a mão.
export function buildCoffeeFx(look: CoffeeFxLook): readonly ArtRect[] {
  if (look === 'idle') return [];
  if (look === 'pressing') return [{ ...LIT, blink: 2 }, r([134, 472, 20, 2], '--room-button-on')];
  const cupSteam = steam([
    [116, 484, 4, 6],
    [122, 478, 4, 6],
    [140, 452, 6, 6],
    [146, 444, 6, 6],
  ]);
  if (look === 'ready') return [...CUP_IN_BAY, ...cupSteam];
  const drip = { ...r([120, 474, 4, 22], '--room-coffee'), motion: 'drip' as const };
  const vent = steam([
    [92, 404, 8, 8],
    [86, 392, 8, 8],
    [94, 380, 8, 8],
  ]);
  return [LIT, ...CUP_IN_BAY, drip, ...cupSteam, ...vent];
}

// A poça de café no chão, nos pés de quem derrubou: mancha larga, um brilho e respingos.
export function buildPuddle(spot: { readonly x: number; readonly y: number }): readonly ArtRect[] {
  const { x, y } = spot;
  return [
    r([x + 4, y + 108, 64, 8], '--room-coffee'),
    r([x + 12, y + 104, 44, 4], '--room-coffee'),
    r([x + 16, y + 116, 36, 4], '--room-coffee'),
    r([x + 20, y + 108, 16, 2], '--room-coffee-light'),
    r([x + 72, y + 110, 4, 4], '--room-coffee'),
    r([x - 4, y + 114, 4, 4], '--room-coffee'),
  ];
}
