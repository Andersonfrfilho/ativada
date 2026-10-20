// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { BalconySlot } from '../team-room/balcony/balcony.constant.js';
import {
  COFFEE,
  COFFEE_COUNTER,
  DESK_HEIGHT,
  DESK_WIDTH,
  DESKS,
  LECTERN,
  LECTERN_SIZE,
  PLANTS,
  seatOf,
} from './office-geometry.js';
import { COLUMNS, isInside, pointOf, ROWS, tileOf, type Point, type Tile } from './office-grid.js';

// O que se pode pisar: um ladrilho é bloqueado quando o corpo do boneco (x + 12 a x + 60) cobre um móvel e os pés (y + 112)
// caem na faixa do chão que o móvel ocupa. Mesas da equipe, púlpito, balcão do café e vasos bloqueiam; parede e telão
// ficam fora da grade. O assento de cada um é só dele e o ladrilho da máquina é só de quem a usa agora.
const BODY = { left: 12, right: 60 } as const;
const FEET = 112;
const DESK_FLOOR_TOP = 56;
const PLANT_SIZE = { width: 72, floorTop: 40, bottom: 96 } as const;

type Band = {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
};

export type FloorMask = {
  readonly key: string;
  // Ladrilhos de passagem (sem móvel, sem assento, sem a máquina).
  readonly isTransit: (tile: Tile) => boolean;
  readonly seats: ReadonlyMap<string, BalconySlot>;
  readonly machine: Tile;
};

function bandsOf(crew: readonly BalconySlot[]): readonly Band[] {
  const desks = crew.flatMap((who) => {
    const desk = DESKS[who];
    if (desk === undefined) return [];
    const top = desk.y + DESK_FLOOR_TOP;
    return [{ left: desk.x, right: desk.x + DESK_WIDTH, top, bottom: desk.y + DESK_HEIGHT }];
  });
  const lectern = {
    left: LECTERN.x,
    right: LECTERN.x + LECTERN_SIZE.width,
    top: LECTERN.y + DESK_FLOOR_TOP,
    bottom: LECTERN.y + LECTERN_SIZE.height,
  };
  const counter = {
    left: COFFEE_COUNTER.x,
    right: COFFEE_COUNTER.x + COFFEE_COUNTER.width,
    top: COFFEE_COUNTER.top - 24,
    bottom: COFFEE_COUNTER.front,
  };
  const plants = PLANTS.map((plant) => ({
    left: plant.x,
    right: plant.x + PLANT_SIZE.width,
    top: plant.y + PLANT_SIZE.floorTop,
    bottom: plant.y + PLANT_SIZE.bottom + 32,
  }));
  return [...desks, lectern, counter, ...plants];
}

function isCovered(point: Point, band: Band): boolean {
  const feet = point.y + FEET;
  const overlapsX = point.x + BODY.right > band.left && point.x + BODY.left < band.right;
  return overlapsX && feet > band.top && feet <= band.bottom;
}

function keyOf(tile: Tile): string {
  return `${tile.c},${tile.r}`;
}

function buildMask(crew: readonly BalconySlot[]): FloorMask {
  const bands = bandsOf(crew);
  const seats = new Map(crew.map((who) => [keyOf(tileOf(seatOf(who))), who] as const));
  const machine = tileOf(COFFEE);
  const open = new Set<string>();
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLUMNS; c += 1) {
      const point = pointOf({ c, r });
      const key = keyOf({ c, r });
      const isFree = !bands.some((band) => isCovered(point, band));
      if (isFree && !seats.has(key) && key !== keyOf(machine)) open.add(key);
    }
  }
  return {
    key: [...crew].sort().join(','),
    isTransit: (tile) => isInside(tile) && open.has(keyOf(tile)),
    seats,
    machine,
  };
}

const CACHE = new Map<string, FloorMask>();

export function floorMaskOf(crew: readonly BalconySlot[]): FloorMask {
  const key = [...crew].sort().join(',');
  const cached = CACHE.get(key);
  if (cached !== undefined) return cached;
  const mask = buildMask(crew);
  CACHE.set(key, mask);
  return mask;
}

// Pode ficar neste ladrilho: passagem, o próprio assento, ou a máquina para quem a segura.
export function canStand(
  mask: FloorMask,
  who: BalconySlot,
  options: { readonly tile: Tile; readonly machineHolder: BalconySlot | undefined },
): boolean {
  const { tile } = options;
  if (mask.isTransit(tile)) return true;
  if (mask.seats.get(keyOf(tile)) === who) return true;
  return tile.c === mask.machine.c && tile.r === mask.machine.r && options.machineHolder === who;
}

export { keyOf as tileKey };
