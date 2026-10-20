// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { BalconySlot } from '../team-room/balcony/balcony.constant.js';
import type { DeskSide, ScreenKind } from './desk-art.js';
import { FLOOR_TOP, pointOf, TILE, tileOf, type Point } from './office-grid.js';

// A planta do piso em unidades de desenho do preview (1600 de largura; o piso vai de y 340 a 1028). O telão fica ACIMA do
// piso: a frente dele é a fileira de cima (`FLOOR_TOP`), e nenhuma posição de agente sobe além dela. A faixa de cima do piso
// (fileiras 0 a 2) é livre: corredor da frente do telão, o canto do café à esquerda e o bebedouro à direita.
export type { Point } from './office-grid.js';
export { FLOOR_TOP } from './office-grid.js';
export type DeskSpot = Point & {
  readonly side: DeskSide;
  readonly kinds: readonly [ScreenKind, ScreenKind, ScreenKind];
};

export const FIGURE = { width: 72, height: 116 } as const;
export const DESK_WIDTH = 288;
export const DESK_HEIGHT = 176;
export const LECTERN: Point = { x: 744, y: 840 };
export const LECTERN_SIZE = { width: 128, height: 160 } as const;

// O canto do café: balcão no chão do canto de cima à esquerda, a máquina na ponta direita dele. Quem usa a máquina fica no
// ladrilho logo à direita, olhando para ela; o próximo espera dois ladrilhos adiante; quem bebe fica na frente do balcão.
export const COFFEE_COUNTER = { x: 0, width: 160, top: 520, front: 556 } as const;
export const COFFEE: Point = pointOf({ c: 5, r: 0 });
export const COFFEE_QUEUE: Point = pointOf({ c: 7, r: 0 });
export const COFFEE_SPOTS: readonly Point[] = [pointOf({ c: 0, r: 2 }), pointOf({ c: 3, r: 2 })];
export const COFFEE_CORNER = { x: 0, y: 340, width: 352, height: 296 } as const;
export const PLANTS: readonly Point[] = [
  { x: 330, y: 928 },
  { x: 1212, y: 928 },
];

const GATHER_COLUMN_STEP = 3;
const SCREEN_CENTER_COLUMN = 24;
const SEAT_LIFT = 24;

export const DESKS: Readonly<Partial<Record<BalconySlot, DeskSpot>>> = {
  tiago: { x: 32, y: 628, side: 'left', kinds: ['chart', 'book', 'news'] },
  renata: { x: 32, y: 828, side: 'left', kinds: ['chart', 'heat', 'news'] },
  vitor: { x: 1280, y: 628, side: 'right', kinds: ['book', 'chart', 'heat'] },
  sofia: { x: 1280, y: 828, side: 'right', kinds: ['news', 'chart', 'heat'] },
  otavio: { x: 400, y: 828, side: 'left', kinds: ['heat', 'book', 'news'] },
  olivia: { x: 920, y: 828, side: 'right', kinds: ['chart', 'news', 'book'] },
  nina: { x: 480, y: 648, side: 'left', kinds: ['chart', 'book', 'heat'] },
  lucas: { x: 848, y: 648, side: 'right', kinds: ['news', 'chart', 'book'] },
};

// Onde cada um fica de pé na frente do telão para apontar (fileira de cima, colunas a duas ou mais de distância).
const SCREEN_COLUMN: Readonly<Record<BalconySlot, number>> = {
  tiago: 13,
  renata: 15,
  otavio: 18,
  nina: 21,
  alice: 24,
  olivia: 28,
  sofia: 31,
  vitor: 34,
  lucas: 37,
};

// O assento fica na fileira logo acima da frente da mesa (o boneco aparece atrás dela, sentado).
function seatRowOf(deskY: number): number {
  return Math.floor((deskY - SEAT_LIFT - FLOOR_TOP) / TILE);
}

export function seatOf(who: BalconySlot): Point {
  const desk = DESKS[who];
  if (desk === undefined) return pointOf({ c: 24, r: seatRowOf(LECTERN.y - 32) });
  const x = desk.side === 'left' ? desk.x + 168 : desk.x + 48;
  return pointOf({ c: tileOf({ x, y: FLOOR_TOP }).c, r: seatRowOf(desk.y) });
}

export function screenSpotOf(who: BalconySlot): Point {
  return pointOf({ c: SCREEN_COLUMN[who], r: 0 });
}

export function gatherSpot(index: number, total: number): Point {
  const first = SCREEN_CENTER_COLUMN - Math.floor(((total - 1) * GATHER_COLUMN_STEP) / 2);
  return pointOf({ c: first + index * GATHER_COLUMN_STEP, r: 0 });
}

// Onde ficaria quem vem conversar com a pessoa na mesa, em ordem de preferência (o primeiro ladrilho livre vence).
export function visitCandidatesOf(who: BalconySlot): readonly Point[] {
  const seat = tileOf(seatOf(who));
  return [
    { c: seat.c + 4, r: seat.r },
    { c: seat.c - 4, r: seat.r },
    { c: seat.c + 3, r: seat.r - 1 },
    { c: seat.c - 3, r: seat.r - 1 },
    { c: seat.c + 2, r: seat.r - 2 },
  ].map(pointOf);
}

// A profundidade: quem está mais embaixo na tela fica na frente.
export function depthOf(y: number): number {
  return Math.round((y + FIGURE.height) / 10);
}
