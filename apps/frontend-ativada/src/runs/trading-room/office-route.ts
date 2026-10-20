// Copyright (c) 2026 Ada Technology. All rights reserved.
import { AISLE_LEFT, AISLE_RIGHT, FLOOR_TOP, type Point } from './office-geometry.js';

export const STEP_UNITS = 32;

function isSame(left: Point, right: Point): boolean {
  return left.x === right.x && left.y === right.y;
}

function entryOf(to: Point): Point {
  if (to.x < AISLE_LEFT) return { x: AISLE_LEFT, y: to.y };
  return to.x > AISLE_RIGHT ? { x: AISLE_RIGHT, y: to.y } : to;
}

// Os cantos do caminho pelos corredores: sai da coluna de mesas pelo corredor, sobe ou desce e entra no destino. Nenhum
// ponto sobe além da frente do telão (`FLOOR_TOP`).
export function routeCorners(from: Point, to: Point): readonly Point[] {
  const corners: Point[] = [];
  let cursor = from;
  const push = (point: Point): void => {
    const safe = { x: point.x, y: Math.max(FLOOR_TOP, point.y) };
    if (isSame(safe, cursor)) return;
    corners.push(safe);
    cursor = safe;
  };
  if (from.x < AISLE_LEFT) push({ x: AISLE_LEFT, y: from.y });
  if (from.x > AISLE_RIGHT) push({ x: AISLE_RIGHT, y: from.y });
  const entry = entryOf(to);
  if (entry.y < cursor.y) push({ x: cursor.x, y: entry.y });
  push({ x: entry.x, y: cursor.y });
  push(entry);
  push(to);
  return corners;
}

function stepToward(at: number, goal: number): number {
  return at + Math.sign(goal - at) * Math.min(STEP_UNITS, Math.abs(goal - at));
}

// O caminho inteiro em passos de no máximo um ladrilho (32), primeiro na horizontal, depois na vertical, até cada canto.
export function routeSteps(from: Point, to: Point): readonly Point[] {
  const steps: Point[] = [];
  let at = from;
  for (const corner of routeCorners(from, to)) {
    while (!isSame(at, corner)) {
      at =
        at.x === corner.x
          ? { x: at.x, y: stepToward(at.y, corner.y) }
          : { x: stepToward(at.x, corner.x), y: at.y };
      steps.push(at);
    }
  }
  return steps;
}
