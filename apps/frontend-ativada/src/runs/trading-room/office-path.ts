// Copyright (c) 2026 Ada Technology. All rights reserved.
import { tileKey, type FloorMask } from './office-mask.js';
import { COLUMNS, NEIGHBOURS, ROWS, type Tile } from './office-grid.js';

// Caminhos em 8 direções sobre a grade: a distância de cada ladrilho até o destino (um campo calculado uma vez por destino e
// guardado). Diagonal só quando os dois ladrilhos do lado também são de passagem: ninguém corta a quina de um móvel.
const UNREACHABLE = -1;

type Field = Int16Array;

function indexOf(tile: Tile): number {
  return tile.r * COLUMNS + tile.c;
}

function isOpen(mask: FloorMask, tile: Tile, goal: Tile): boolean {
  return mask.isTransit(tile) || (tile.c === goal.c && tile.r === goal.r);
}

// O passo de `from` para `to` (vizinhos) não corta quina: na diagonal, os dois ortogonais precisam ser de passagem.
export function isCleanStep(mask: FloorMask, from: Tile, to: Tile): boolean {
  if (from.c === to.c || from.r === to.r) return true;
  return mask.isTransit({ c: to.c, r: from.r }) && mask.isTransit({ c: from.c, r: to.r });
}

function buildField(mask: FloorMask, goal: Tile): Field {
  const field = new Int16Array(COLUMNS * ROWS).fill(UNREACHABLE);
  field[indexOf(goal)] = 0;
  const queue: Tile[] = [goal];
  for (let head = 0; head < queue.length; head += 1) {
    const tile = queue[head];
    if (tile === undefined) break;
    const distance = field[indexOf(tile)] ?? 0;
    for (const step of NEIGHBOURS) {
      const next = { c: tile.c + step.c, r: tile.r + step.r };
      if (!isOpen(mask, next, goal) || field[indexOf(next)] !== UNREACHABLE) continue;
      if (!isCleanStep(mask, tile, next)) continue;
      field[indexOf(next)] = distance + 1;
      queue.push(next);
    }
  }
  return field;
}

const FIELDS = new Map<string, Field>();

function fieldOf(mask: FloorMask, goal: Tile): Field {
  const key = `${mask.key}|${tileKey(goal)}`;
  const cached = FIELDS.get(key);
  if (cached !== undefined) return cached;
  const field = buildField(mask, goal);
  FIELDS.set(key, field);
  return field;
}

export function distanceTo(mask: FloorMask, from: Tile, goal: Tile): number {
  return fieldOf(mask, goal)[indexOf(from)] ?? UNREACHABLE;
}

// Os próximos ladrilhos que aproximam do destino, do melhor para o pior (o reto vence a diagonal no empate).
export function stepsToward(mask: FloorMask, from: Tile, goal: Tile): readonly Tile[] {
  const field = fieldOf(mask, goal);
  const here = field[indexOf(from)] ?? UNREACHABLE;
  return NEIGHBOURS.map((step) => ({ c: from.c + step.c, r: from.r + step.r }))
    .filter((next) => next.c >= 0 && next.c < COLUMNS && next.r >= 0 && next.r < ROWS)
    .filter((next) => isOpen(mask, next, goal) && isCleanStep(mask, from, next))
    .map((next) => ({ next, distance: field[indexOf(next)] ?? UNREACHABLE }))
    .filter(({ distance }) => distance !== UNREACHABLE && (here === UNREACHABLE || distance < here))
    .sort((left, right) => left.distance - right.distance)
    .map(({ next }) => next);
}

// O ladrilho de passagem mais perto de `goal` que satisfaz `isFree` (busca em largura a partir dele).
export function nearestTransit(
  mask: FloorMask,
  goal: Tile,
  isFree: (tile: Tile) => boolean,
): Tile | undefined {
  const seen = new Set<string>([tileKey(goal)]);
  const queue: Tile[] = [goal];
  for (let head = 0; head < queue.length; head += 1) {
    const tile = queue[head];
    if (tile === undefined) break;
    if (mask.isTransit(tile) && isFree(tile)) return tile;
    for (const step of NEIGHBOURS) {
      const next = { c: tile.c + step.c, r: tile.r + step.r };
      const key = tileKey(next);
      if (next.c < 0 || next.c >= COLUMNS || next.r < 0 || next.r >= ROWS || seen.has(key))
        continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return undefined;
}
