// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { BalconySlot } from '../team-room/balcony/balcony.constant.js';

// Avatares em pixel art ORIGINAIS (grade 18 × 29, contorno automático), portados do preview aprovado da direção E. Cada um
// tem o adereço que faz a silhueta: topete em seta, coque, fone largo, cabelo longo, rabo de cavalo com headset, lupa e o
// halo das equipes ◆. Dois quadros de perna para andar e um braço erguido para apontar. A cor é um nome (`--px-<nome>`).
export const AVATAR_WIDTH = 18;
export const AVATAR_HEIGHT = 29;

export type PixelRun = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly color: string;
};
export type AvatarPoses = {
  readonly idle: readonly PixelRun[];
  readonly step: readonly PixelRun[];
  readonly point: readonly PixelRun[];
};

type Grid = string[][];
type Box = readonly [x: number, y: number, w: number, h: number];
type Painter = (box: Box, color: string) => void;

function createPainter(grid: Grid): Painter {
  return ([x, y, w, h], color) => {
    for (let row = Math.max(0, y); row < Math.min(AVATAR_HEIGHT, y + h); row += 1) {
      const line = grid[row];
      for (let col = Math.max(0, x); col < Math.min(AVATAR_WIDTH, x + w); col += 1) {
        if (line !== undefined) line[col] = color;
      }
    }
  };
}

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function isFilled(grid: Grid, x: number, y: number): boolean {
  const color = grid[y]?.[x];
  return color !== undefined && color !== '' && color !== 'glow';
}

// Contorno de um pixel em volta de tudo o que foi pintado (menos o brilho do pé das equipes ◆).
export function outline(grid: Grid): Grid {
  return grid.map((line, y) =>
    line.map((color, x) => {
      if (color !== '') return color;
      return NEIGHBOURS.some(([dx, dy]) => isFilled(grid, x + dx, y + dy)) ? 'line' : '';
    }),
  );
}

export function toRuns(grid: Grid): readonly PixelRun[] {
  const runs: PixelRun[] = [];
  grid.forEach((line, y) => {
    let x = 0;
    while (x < line.length) {
      const color = line[x] ?? '';
      let end = x;
      while (line[end + 1] === color) end += 1;
      if (color !== '') runs.push({ x, y, w: end - x + 1, color });
      x = end + 1;
    }
  });
  return runs;
}

export function emptyGrid(): Grid {
  return Array.from({ length: AVATAR_HEIGHT }, () =>
    Array.from({ length: AVATAR_WIDTH }, () => ''),
  );
}

export type AvatarWho = BalconySlot;
export { createPainter, type Box, type Grid, type Painter };
