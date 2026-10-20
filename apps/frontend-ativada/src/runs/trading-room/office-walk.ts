// Copyright (c) 2026 Ada Technology. All rights reserved.
import { fadeSpeech } from './office-chat.js';
import {
  facingOf,
  isSamePoint,
  NEIGHBOURS,
  pointOf,
  tileDistance,
  tileOf,
  type Point,
} from './office-grid.js';
import type { AgentLife, LifeAction } from './office-life.types.js';
import { isCleanStep, nearestTransit, stepsToward } from './office-path.js';
import { canEnter, isFreeFor, occupantOf, type Traffic } from './office-traffic.js';

type Walk = Extract<LifeAction, { kind: 'walk' }>;

// Travado por mais passos que isto, o agente dá um passo para o lado; por mais que o limite, troca o destino pelo ladrilho
// livre mais perto dele (ou desiste da caminhada se já está lá).
const SIDESTEP_AFTER = 6;
const RETARGET_AFTER = 24;
const STRIDE_PER_STEP = 2;
const STRIDE_CYCLE = 8;

type Move = {
  readonly agent: AgentLife;
  readonly point: Point;
  readonly queue: readonly LifeAction[];
  readonly traffic: Traffic;
};

function moveTo({ agent, point, queue, traffic }: Move): AgentLife {
  traffic.positions.set(agent.who, point);
  return {
    ...agent,
    ...fadeSpeech(agent),
    at: point,
    pose: 'walking',
    face: facingOf(agent.at, point, agent.face),
    stride: (agent.stride + STRIDE_PER_STEP) % STRIDE_CYCLE,
    queue,
  };
}

// Um passo para fora do caminho de quem quer passar: o vizinho livre mais longe do ladrilho que o outro quer.
function sidestep(agent: AgentLife, traffic: Traffic, away: Point | undefined): Point | undefined {
  const from = tileOf(agent.at);
  const options = NEIGHBOURS.map((step) => ({ c: from.c + step.c, r: from.r + step.r }))
    .filter((tile) => traffic.mask.isTransit(tile) && isCleanStep(traffic.mask, from, tile))
    .map(pointOf)
    .filter((point) => isFreeFor(traffic, agent.who, point))
    .filter((point) => away === undefined || tileDistance(point, away) > 0);
  if (away === undefined) return options[0];
  return [...options].sort(
    (left, right) => tileDistance(right, away) - tileDistance(left, away),
  )[0];
}

function retarget(agent: AgentLife, action: Walk, traffic: Traffic): Walk | undefined {
  const goal = tileOf(action.to);
  const free = nearestTransit(traffic.mask, goal, (tile) =>
    isFreeFor(traffic, agent.who, pointOf(tile)),
  );
  if (free === undefined || isSamePoint(pointOf(free), agent.at)) return undefined;
  return { kind: 'walk', to: pointOf(free) };
}

function isPushedBy(agent: AgentLife, traffic: Traffic, blocker: AgentLife['who']): boolean {
  return traffic.blockedBy.get(blocker)?.by === agent.who;
}

function stayBlocked(params: {
  readonly agent: AgentLife;
  readonly action: Walk;
  readonly rest: readonly LifeAction[];
  readonly wants: Point;
}): AgentLife {
  const { agent, action, rest, wants } = params;
  const blocked = (action.blocked ?? 0) + 1;
  return {
    ...agent,
    ...fadeSpeech(agent),
    pose: 'standing',
    face: facingOf(agent.at, wants, agent.face),
    queue: [{ ...action, blocked }, ...rest],
  };
}

function handleBlocked(params: {
  readonly agent: AgentLife;
  readonly action: Walk;
  readonly rest: readonly LifeAction[];
  readonly traffic: Traffic;
  readonly wants: Point;
}): AgentLife {
  const { agent, action, rest, traffic, wants } = params;
  const blocker = occupantOf(traffic, wants, agent.who);
  if (blocker !== undefined) traffic.blockedBy.set(agent.who, { by: blocker, wants });
  const goalTaken = occupantOf(traffic, action.to, agent.who);
  const isStuck = (action.blocked ?? 0) >= RETARGET_AFTER;
  if ((goalTaken !== undefined && !traffic.walkers.has(goalTaken)) || isStuck) {
    const next = retarget(agent, action, traffic);
    return { ...agent, queue: next === undefined ? rest : [next, ...rest] };
  }
  const isMutual = blocker !== undefined && isPushedBy(agent, traffic, blocker);
  if (isMutual || (action.blocked ?? 0) >= SIDESTEP_AFTER) {
    const side = sidestep(agent, traffic, wants);
    if (side !== undefined)
      return moveTo({ agent, point: side, queue: [{ ...action, blocked: 0 }, ...rest], traffic });
  }
  return stayBlocked({ agent, action, rest, wants });
}

// Um passo de caminhada: o melhor vizinho livre que aproxima do destino (8 direções, sem cortar quina). Ocupado, espera,
// cede ou troca o destino. Nunca dois no mesmo ladrilho: cada um confere as posições já atualizadas neste passo.
export function walkStep(params: {
  readonly agent: AgentLife;
  readonly action: Walk;
  readonly rest: readonly LifeAction[];
  readonly traffic: Traffic;
}): AgentLife | undefined {
  const { agent, action, rest, traffic } = params;
  if (isSamePoint(agent.at, action.to)) return undefined;
  const options = stepsToward(traffic.mask, tileOf(agent.at), tileOf(action.to))
    .filter((tile) => canEnter(traffic, agent.who, tile))
    .map(pointOf);
  const [best] = options;
  if (best === undefined) return { ...agent, queue: rest };
  const free = options.find((point) => occupantOf(traffic, point, agent.who) === undefined);
  if (free === undefined) return handleBlocked({ agent, action, rest, traffic, wants: best });
  const queue = isSamePoint(free, action.to) ? rest : [{ ...action, blocked: 0 }, ...rest];
  return moveTo({ agent, point: free, queue: queue, traffic });
}
