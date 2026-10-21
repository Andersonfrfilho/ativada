// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { BalconySlot } from '../team-room/balcony/balcony.constant.js';
import { createRandom } from '../team-room/motion/seeded-random.js';
import { isConflict, type Point, tileOf, type Tile } from './office-grid.js';
import { canStand, type FloorMask } from './office-mask.js';
import type { AgentLife } from './office-life.types.js';

// O trânsito de um passo: onde cada um está (atualizado à medida que anda), quem quer andar e quem ficou travado por quem.
// Cada passo processa os agentes na ordem da prioridade sorteada com a semente: o de prioridade mais alta anda primeiro, e
// num impasse frente a frente quem cede é o de prioridade mais baixa.
export type Traffic = {
  readonly mask: FloorMask;
  // Muda no meio do passo quando alguém pega ou solta a máquina.
  machineHolder: BalconySlot | undefined;
  readonly positions: Map<BalconySlot, Point>;
  readonly walkers: ReadonlySet<BalconySlot>;
  readonly blockedBy: Map<BalconySlot, { readonly by: BalconySlot; readonly wants: Point }>;
};

export function createTraffic(params: {
  readonly mask: FloorMask;
  readonly machineHolder: BalconySlot | undefined;
  readonly agents: readonly AgentLife[];
}): Traffic {
  return {
    mask: params.mask,
    machineHolder: params.machineHolder,
    positions: new Map(params.agents.map((agent) => [agent.who, agent.at] as const)),
    walkers: new Set(
      params.agents.filter((agent) => agent.queue[0]?.kind === 'walk').map((agent) => agent.who),
    ),
    blockedBy: new Map(),
  };
}

// A ordem do passo: a prioridade de cada um vem da semente (a mesma semente dá sempre a mesma ordem).
export function priorityOrder(agents: readonly AgentLife[], seed: number): readonly number[] {
  return createRandom(seed).shuffle(agents.map((_, index) => index));
}

// Quem ocupa (ou encosta em) este ponto, fora `who`.
export function occupantOf(
  traffic: Traffic,
  point: Point,
  who: BalconySlot,
): BalconySlot | undefined {
  for (const [other, at] of traffic.positions) {
    if (other !== who && isConflict(at, point)) return other;
  }
  return undefined;
}

export function canEnter(traffic: Traffic, who: BalconySlot, tile: Tile): boolean {
  return canStand(traffic.mask, who, { tile, machineHolder: traffic.machineHolder });
}

export function isFreeFor(traffic: Traffic, who: BalconySlot, point: Point): boolean {
  return canEnter(traffic, who, tileOf(point)) && occupantOf(traffic, point, who) === undefined;
}
