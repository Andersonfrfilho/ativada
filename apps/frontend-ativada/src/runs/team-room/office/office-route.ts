// Copyright (c) 2026 Ada Technology. All rights reserved.
import { isInside, keyOf, type Cell } from './office-grid.js';

const NEIGHBORS: readonly Cell[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

function stepsFrom(cell: Cell, blocked: ReadonlySet<string>): readonly Cell[] {
  return NEIGHBORS.map((delta) => ({ x: cell.x + delta.x, y: cell.y + delta.y })).filter(
    (next) => isInside(next) && !blocked.has(keyOf(next)),
  );
}

function walkBack(from: Cell, to: Cell, previous: ReadonlyMap<string, Cell>): readonly Cell[] {
  const path: Cell[] = [];
  let current: Cell | undefined = to;
  while (current !== undefined && keyOf(current) !== keyOf(from)) {
    path.unshift(current);
    current = previous.get(keyOf(current));
  }
  return path;
}

// O caminho mais curto pela grade, uma casa por passo, sem passar por célula fechada. Devolve as células DEPOIS de `from` até
// `to` (vazio se já está lá) ou `undefined` se não há caminho. A ordem fixa dos vizinhos torna a rota determinística.
export function routeBetween(
  from: Cell,
  to: Cell,
  blocked: ReadonlySet<string>,
): readonly Cell[] | undefined {
  if (keyOf(from) === keyOf(to)) return [];
  const previous = new Map<string, Cell>();
  const seen = new Set<string>([keyOf(from)]);
  const queue: Cell[] = [from];
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    if (current === undefined) break;
    for (const next of stepsFrom(current, blocked)) {
      if (seen.has(keyOf(next))) continue;
      seen.add(keyOf(next));
      previous.set(keyOf(next), current);
      if (keyOf(next) === keyOf(to)) return walkBack(from, to, previous);
      queue.push(next);
    }
  }
  return undefined;
}
