// Copyright (c) 2026 Ada Technology. All rights reserved.

// A grade do piso: cada agente fica num ladrilho de 32 unidades (o canto de cima à esquerda do boneco). O corpo ocupa DUAS
// colunas da mesma fileira; dois agentes nunca dividem um ladrilho, então na mesma fileira ficam a duas colunas ou mais.
export type Point = { readonly x: number; readonly y: number };
export type Tile = { readonly c: number; readonly r: number };
export type Facing = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export const TILE = 32;
export const FLOOR_TOP = 444;
export const FLOOR_HEIGHT = 688;
export const COLUMNS = 49;
export const ROWS = 15;
export const FOOTPRINT_COLUMNS = 2;

export const NEIGHBOURS: readonly Tile[] = [
  { c: 0, r: -1 },
  { c: 1, r: 0 },
  { c: 0, r: 1 },
  { c: -1, r: 0 },
  { c: 1, r: -1 },
  { c: 1, r: 1 },
  { c: -1, r: 1 },
  { c: -1, r: -1 },
];

export function tileOf(point: Point): Tile {
  return { c: Math.round(point.x / TILE), r: Math.round((point.y - FLOOR_TOP) / TILE) };
}

export function pointOf(tile: Tile): Point {
  return { x: tile.c * TILE, y: FLOOR_TOP + tile.r * TILE };
}

export function snapPoint(point: Point): Point {
  return pointOf(tileOf(point));
}

export function isInside(tile: Tile): boolean {
  return tile.c >= 0 && tile.c < COLUMNS && tile.r >= 0 && tile.r < ROWS;
}

export function isSameTile(left: Tile, right: Tile): boolean {
  return left.c === right.c && left.r === right.r;
}

export function isSamePoint(left: Point, right: Point): boolean {
  return left.x === right.x && left.y === right.y;
}

// Dois agentes se chocam quando os ladrilhos dos corpos (duas colunas) se tocam na mesma fileira.
export function isConflict(left: Point, right: Point): boolean {
  return left.y === right.y && Math.abs(left.x - right.x) < FOOTPRINT_COLUMNS * TILE;
}

// Os ladrilhos que o corpo cobre.
export function footprintOf(point: Point): readonly string[] {
  const tile = tileOf(point);
  return Array.from({ length: FOOTPRINT_COLUMNS }, (_, index) => `${tile.c + index},${tile.r}`);
}

export function tileDistance(left: Point, right: Point): number {
  const a = tileOf(left);
  const b = tileOf(right);
  return Math.max(Math.abs(a.c - b.c), Math.abs(a.r - b.r));
}

const FACING_BY_SIGN: Readonly<Record<string, Facing>> = {
  '0,-1': 'n',
  '1,-1': 'ne',
  '1,0': 'e',
  '1,1': 'se',
  '0,1': 's',
  '-1,1': 'sw',
  '-1,0': 'w',
  '-1,-1': 'nw',
};

// Para onde o boneco olha andando de `from` até `to` (o y cresce para baixo: sul). Parado, mantém `fallback`.
export function facingOf(from: Point, to: Point, fallback: Facing): Facing {
  const key = `${Math.sign(to.x - from.x)},${Math.sign(to.y - from.y)}`;
  return FACING_BY_SIGN[key] ?? fallback;
}

// Olhar de lado para alguém: só leste ou oeste (para a conversa e a visita).
export function sideFacing(from: Point, to: Point, fallback: Facing): Facing {
  if (to.x === from.x) return fallback;
  return to.x < from.x ? 'w' : 'e';
}
