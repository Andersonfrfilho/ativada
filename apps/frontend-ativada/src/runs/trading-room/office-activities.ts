// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Random } from '../team-room/motion/seeded-random.js';
import type { BalconySlot } from '../team-room/balcony/balcony.constant.js';
import { screenSpotOf, seatOf, visitCandidatesOf } from './office-geometry.js';
import { coffeeVariantOf, planCoffee } from './office-coffee.js';
import { isConflict, sideFacing, tileOf, type Facing, type Point } from './office-grid.js';
import type { AgentLife, LifeAction, LifeState, Pose } from './office-life.types.js';
import { floorMaskOf } from './office-mask.js';

export const LIFE_TEXT = { ASK: 'O que você acha,' } as const;

type Activity = 'work' | 'coffee' | 'screen' | 'visit' | 'stretch';
const WEIGHTS: Readonly<Record<string, Readonly<Partial<Record<Activity, number>>>>> = {
  default: { work: 42, coffee: 14, screen: 18, visit: 20, stretch: 6 },
  alice: { work: 50, screen: 30, visit: 20 },
  otavio: { work: 28, coffee: 14, visit: 50, screen: 8 },
};
const SPEECH_STEPS = 8;
const SCREEN_STEPS = 16;

export function restPose(who: BalconySlot): Pose {
  return who === 'alice' ? 'standing' : 'seated';
}

function pick(who: BalconySlot, random: Random): Activity {
  const table = WEIGHTS[who] ?? WEIGHTS['default'] ?? {};
  const entries = Object.entries(table);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random.next() * total;
  const found = entries.find(([, weight]) => {
    roll -= weight;
    return roll <= 0;
  });
  const [activity] = found ?? ['work'];
  return activity === 'coffee' ||
    activity === 'screen' ||
    activity === 'visit' ||
    activity === 'stretch'
    ? activity
    : 'work';
}

// Sentado à mesa o boneco fica de frente (as telas viradas para quem olha a sala).
export const REST_FACING: Facing = 's';

function goAndBack(
  agent: AgentLife,
  to: Point,
  stay: readonly LifeAction[],
): readonly LifeAction[] {
  return [
    { kind: 'walk', to },
    ...stay,
    { kind: 'walk', to: seatOf(agent.who) },
    { kind: 'wait', steps: 1, pose: restPose(agent.who), face: REST_FACING },
  ];
}

// O primeiro lugar livre ao lado da mesa do anfitrião (de passagem e ninguém já a caminho dele).
function visitSpotOf(host: AgentLife, state: LifeState): Point | undefined {
  const mask = floorMaskOf(state.agents.map((agent) => agent.who));
  const promised = state.agents.flatMap((agent) => [
    agent.at,
    ...agent.queue.flatMap((action) => (action.kind === 'walk' ? [action.to] : [])),
  ]);
  return visitCandidatesOf(host.who).find(
    (spot) => mask.isTransit(tileOf(spot)) && !promised.some((point) => isConflict(point, spot)),
  );
}

function visit(
  agent: AgentLife,
  state: LifeState,
  random: Random,
): readonly LifeAction[] | undefined {
  const hosts = state.agents.filter((other) => other.who !== agent.who && other.queue.length === 0);
  const chosen = random.pick(hosts);
  if (chosen === undefined) return undefined;
  const spot = visitSpotOf(chosen, state);
  if (spot === undefined) return undefined;
  const host = chosen.who;
  const ask = `${LIFE_TEXT.ASK} ${state.lines[host]?.name ?? host}?`;
  const answer = state.lines[host]?.line ?? '';
  const face = sideFacing(spot, chosen.at, 's');
  return goAndBack(agent, spot, [
    { kind: 'wait', steps: SPEECH_STEPS, pose: 'standing', say: ask, face },
    { kind: 'reply', host, text: answer },
    { kind: 'wait', steps: SPEECH_STEPS, pose: 'standing' },
  ]);
}

// A próxima coisa que o agente faz, sorteada com a semente do passo. O telão é de um por vez: ocupado, ele trabalha.
export function planActivity(
  agent: AgentLife,
  state: LifeState,
  random: Random,
): readonly LifeAction[] {
  const seat = seatOf(agent.who);
  if (agent.at.x !== seat.x || agent.at.y !== seat.y) {
    return [
      { kind: 'walk', to: seat },
      { kind: 'wait', steps: 1, pose: restPose(agent.who), face: REST_FACING, cup: false },
    ];
  }
  const activity = pick(agent.who, random);
  const work: readonly LifeAction[] = [
    {
      kind: 'wait',
      steps: random.between(14, 28),
      pose: restPose(agent.who),
      face: REST_FACING,
    },
  ];
  if (activity === 'coffee') {
    const home = restPose(agent.who);
    return planCoffee(agent, state, { home, variant: coffeeVariantOf(random) }) ?? work;
  }
  if (activity === 'screen' && state.screenHolder === undefined) {
    return goAndBack(agent, screenSpotOf(agent.who), [
      { kind: 'wait', steps: SCREEN_STEPS, pose: 'pointing', face: 'n' },
      { kind: 'release' },
    ]);
  }
  if (activity === 'visit') return visit(agent, state, random) ?? work;
  if (activity === 'stretch') {
    return [{ kind: 'wait', steps: 6, pose: 'standing', face: REST_FACING }, ...work];
  }
  return work;
}
