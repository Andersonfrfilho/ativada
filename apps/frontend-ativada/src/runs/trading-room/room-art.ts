// Copyright (c) 2026 Ada Technology. All rights reserved.

// Cenário em pixel art ORIGINAL do piso da sala (direção E), em unidades de desenho do preview (1600 de largura; o piso
// vai de y 340 a 900): lambri com rodapé, tapete, café, bebedouro, arquivo, rack de servidores com luzes, plantas e
// luminária. Cada retângulo é desenhado aqui; a cor é um token `--room-*` (ou `--px-*`).
export type ArtRect = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly fill: string;
  // As luzes do rack piscam (só com movimento): três ritmos.
  readonly blink?: 0 | 1 | 2;
};

export const ROOM_VIEW = { x: 0, y: 340, width: 1600, height: 560 } as const;
export const WALL_BOTTOM = 448;
export const TILE = 32;

type Part = (x: number, y: number) => readonly ArtRect[];

function at(x: number, y: number, rects: readonly ArtRect[]): readonly ArtRect[] {
  return rects.map((rect) => ({ ...rect, x: rect.x + x, y: rect.y + y }));
}

type Quad = readonly [x: number, y: number, w: number, h: number];

const r = ([x, y, w, h]: Quad, fill: string): ArtRect => ({ x, y, w, h, fill });

function wall(): readonly ArtRect[] {
  const planks = Array.from({ length: 25 }, (_, index) =>
    r([index * 64, 340, 2, 92], '--room-wood-line'),
  );
  return [
    r([0, 340, 1600, 92], '--room-wood'),
    ...planks,
    r([0, 340, 1600, 6], '--room-wood-light'),
    r([0, 432, 1600, 16], '--room-baseboard'),
  ];
}

function rug(): readonly ArtRect[] {
  return [
    r([416, 476, 768, 192], '--room-rug'),
    r([432, 492, 736, 8], '--room-rug-light'),
    r([432, 644, 736, 8], '--room-rug-light'),
    r([432, 492, 8, 160], '--room-rug-light'),
    r([1160, 492, 8, 160], '--room-rug-light'),
  ];
}

export const chair: Part = (x, y) =>
  at(x, y, [
    r([8, 0, 56, 44], '--room-chair'),
    r([8, 0, 56, 8], '--room-chair-light'),
    r([4, 40, 64, 20], '--room-chair-dark'),
    r([32, 60, 8, 16], '--room-metal'),
  ]);

const plant: Part = (x, y) =>
  at(x, y, [
    r([16, 56, 40, 40], '--room-pot'),
    r([12, 52, 48, 8], '--room-pot-light'),
    r([8, 16, 56, 36], '--room-leaf'),
    r([20, 0, 32, 20], '--room-leaf'),
    r([0, 28, 16, 16], '--room-leaf-dark'),
    r([56, 24, 16, 16], '--room-leaf-dark'),
    r([28, 8, 8, 8], '--room-leaf-light'),
    r([44, 32, 8, 8], '--room-leaf-light'),
  ]);

const coffee: Part = (x, y) =>
  at(x, y, [
    r([0, 40, 88, 56], '--room-cabinet'),
    r([0, 40, 88, 6], '--room-cabinet-light'),
    r([12, 0, 44, 40], '--room-machine'),
    r([18, 6, 32, 10], '--screen'),
    r([28, 22, 12, 6], '--room-metal'),
    r([44, 22, 6, 6], '--room-metal'),
    r([62, 28, 10, 12], '--room-mug'),
  ]);

const cooler: Part = (x, y) =>
  at(x, y, [
    r([8, 0, 32, 36], '--room-water'),
    r([12, 4, 8, 24], '--room-water-light'),
    r([0, 36, 48, 60], '--room-cooler'),
  ]);

const cabinet: Part = (x, y) =>
  at(x, y, [
    r([0, 0, 56, 96], '--room-cabinet'),
    ...[8, 38, 68].flatMap((d) => [
      r([4, d, 48, 24], '--room-cabinet-light'),
      r([22, d + 9, 12, 4], '--room-metal'),
    ]),
  ]);

function blinkOf(row: number): 0 | 1 | 2 {
  const phase = row % 3;
  if (phase === 0) return 0;
  return phase === 1 ? 1 : 2;
}

function rack(x: number, y: number): readonly ArtRect[] {
  const units = Array.from({ length: 7 }, (_, row): readonly ArtRect[] => [
    r([6, 8 + row * 12, 60, 8], '--room-rack-unit'),
    {
      ...r([54, 10 + row * 12, 4, 4], row % 2 === 0 ? '--screen-good' : '--terminal-accent'),
      blink: blinkOf(row),
    },
    { ...r([46, 10 + row * 12, 4, 4], '--terminal-warn'), blink: blinkOf(row + 1) },
  ]);
  return at(x, y, [r([0, 0, 72, 96], '--room-rack'), ...units.flat()]);
}

const lamp: Part = (x, y) =>
  at(x, y, [
    r([12, 0, 32, 20], '--room-lamp-shade'),
    r([16, 20, 24, 4], '--room-lamp'),
    r([26, 24, 4, 64], '--room-metal'),
    r([14, 88, 28, 6], '--room-metal'),
  ]);

// O que muda na máquina de café: o botão aceso (pisca enquanto alguém aperta) e a caneca embaixo do bico enquanto o café sai.
export function buildCoffeeFx(look: 'idle' | 'pressing' | 'brewing'): readonly ArtRect[] {
  if (look === 'idle') return [];
  const button: ArtRect =
    look === 'pressing'
      ? { ...r([44, 22, 6, 6], '--screen-good'), blink: 2 }
      : r([44, 22, 6, 6], '--screen-good');
  const cup = [r([28, 30, 12, 10], '--room-mug'), r([30, 31, 8, 3], '--room-machine')];
  return at(224, 344, look === 'brewing' ? [button, ...cup] : [button]);
}

// A poça de café no chão, na altura dos pés de quem derrubou.
export function buildPuddle(spot: { readonly x: number; readonly y: number }): readonly ArtRect[] {
  return [
    r([spot.x + 20, spot.y + 104, 28, 5], '--room-cabinet'),
    r([spot.x + 26, spot.y + 109, 16, 3], '--room-cabinet'),
  ];
}

// O piso inteiro menos os ladrilhos (o padrão xadrez é um `<pattern>` no componente) e as cadeiras (dependem da equipe).
export function buildRoomArt(): readonly ArtRect[] {
  return [
    ...wall(),
    ...rug(),
    ...coffee(224, 344),
    ...cooler(160, 352),
    ...plant(18, 352),
    ...cabinet(1296, 352),
    ...rack(1368, 352),
    ...plant(1456, 352),
    ...lamp(1530, 352),
    ...plant(330, 808),
    ...plant(1212, 808),
  ];
}
