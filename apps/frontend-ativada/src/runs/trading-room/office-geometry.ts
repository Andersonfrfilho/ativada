// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { BalconySlot } from '../team-room/balcony/balcony.constant.js';
import type { DeskSide, ScreenKind } from './desk-art.js';

// A planta do piso em unidades de desenho do preview (1600 × 900; o piso começa em y 340). O telão fica ACIMA do piso, fora
// desta cena: a frente dele é a linha `FLOOR_TOP`, e nenhuma posição de agente sobe além dela.
export type Point = { readonly x: number; readonly y: number };
export type DeskSpot = Point & {
  readonly side: DeskSide;
  readonly kinds: readonly [ScreenKind, ScreenKind, ScreenKind];
};

export const FIGURE = { width: 72, height: 116 } as const;
export const FLOOR_TOP = 444;
export const AISLE_LEFT = 336;
export const AISLE_RIGHT = 1208;
export const DESK_WIDTH = 288;
export const LECTERN: Point = { x: 744, y: 712 };
export const COFFEE: Point = { x: 296, y: FLOOR_TOP };
const GATHER_STEP = 104;
const SCREEN_CENTER = 800;

export const DESKS: Readonly<Partial<Record<BalconySlot, DeskSpot>>> = {
  tiago: { x: 32, y: 500, side: 'left', kinds: ['chart', 'book', 'news'] },
  renata: { x: 32, y: 700, side: 'left', kinds: ['chart', 'heat', 'news'] },
  vitor: { x: 1280, y: 500, side: 'right', kinds: ['book', 'chart', 'heat'] },
  sofia: { x: 1280, y: 700, side: 'right', kinds: ['news', 'chart', 'heat'] },
  otavio: { x: 400, y: 700, side: 'left', kinds: ['heat', 'book', 'news'] },
  olivia: { x: 920, y: 700, side: 'right', kinds: ['chart', 'news', 'book'] },
  nina: { x: 480, y: 520, side: 'left', kinds: ['chart', 'book', 'heat'] },
  lucas: { x: 848, y: 520, side: 'right', kinds: ['news', 'chart', 'book'] },
};

// Onde cada um fica de pé na frente do telão para apontar.
const SCREEN_SPOT_X: Readonly<Record<BalconySlot, number>> = {
  tiago: 400,
  renata: 480,
  otavio: 576,
  nina: 656,
  alice: 776,
  olivia: 896,
  sofia: 992,
  vitor: 1088,
  lucas: 1168,
};

export function seatOf(who: BalconySlot): Point {
  const desk = DESKS[who];
  if (desk === undefined) return { x: 772, y: 656 };
  return { x: desk.side === 'left' ? desk.x + 168 : desk.x + 48, y: desk.y - 40 };
}

export function screenSpotOf(who: BalconySlot): Point {
  return { x: SCREEN_SPOT_X[who], y: FLOOR_TOP };
}

export function gatherSpot(index: number, total: number): Point {
  const left = SCREEN_CENTER - ((total - 1) * GATHER_STEP) / 2 - FIGURE.width / 2;
  return { x: left + index * GATHER_STEP, y: FLOOR_TOP };
}

// Onde fica quem vem conversar com a pessoa na mesa dela.
export function visitSpotOf(who: BalconySlot): Point {
  const seat = seatOf(who);
  if (who === 'tiago' || who === 'renata') return { x: AISLE_LEFT, y: seat.y };
  if (who === 'vitor' || who === 'sofia') return { x: AISLE_RIGHT, y: seat.y };
  if (who === 'otavio') return { x: 480, y: 592 };
  if (who === 'olivia') return { x: 1056, y: 592 };
  if (who === 'nina' || who === 'lucas') return { x: seat.x, y: FLOOR_TOP };
  return { x: 680, y: 592 };
}

// A profundidade: quem está mais embaixo na tela fica na frente.
export function depthOf(y: number): number {
  return Math.round((y + FIGURE.height) / 10);
}
