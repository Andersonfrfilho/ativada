// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Random } from '../team-room/motion/seeded-random.js';
import type { BalconySlot } from '../team-room/balcony/balcony.constant.js';
import { COFFEE, screenSpotOf, seatOf, visitSpotOf, type Point } from './office-geometry.js';
import type { AgentLife, LifeAction, LifeState, Pose } from './office-life.types.js';
import { routeSteps } from './office-route.js';

export const LIFE_TEXT = { COFFEE: 'Pausa para o café.', ASK: 'O que você acha,' } as const;

type Activity = 'work' | 'coffee' | 'screen' | 'visit' | 'stretch';
const WEIGHTS: Readonly<Record<string, Readonly<Partial<Record<Activity, number>>>>> = {
  default: { work: 42, coffee: 14, screen: 18, visit: 20, stretch: 6 },
  alice: { work: 50, screen: 30, visit: 20 },
  otavio: { work: 28, coffee: 14, visit: 50, screen: 8 },
};
const SPEECH_STEPS = 8;
const SCREEN_STEPS = 16;
const COFFEE_STEPS = 9;

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

function trip(from: Point, to: Point): LifeAction {
  return { kind: 'walk', steps: routeSteps(from, to) };
}

function goAndBack(
  agent: AgentLife,
  to: Point,
  stay: readonly LifeAction[],
): readonly LifeAction[] {
  const seat = seatOf(agent.who);
  return [
    trip(agent.at, to),
    ...stay,
    trip(to, seat),
    { kind: 'wait', steps: 1, pose: restPose(agent.who) },
  ];
}

function visit(
  agent: AgentLife,
  state: LifeState,
  random: Random,
): readonly LifeAction[] | undefined {
  const hosts = state.agents.filter((other) => other.who !== agent.who && other.queue.length === 0);
  const host = random.pick(hosts)?.who;
  if (host === undefined) return undefined;
  const ask = `${LIFE_TEXT.ASK} ${state.lines[host]?.name ?? host}?`;
  const answer = state.lines[host]?.line ?? '';
  return goAndBack(agent, visitSpotOf(host), [
    { kind: 'wait', steps: SPEECH_STEPS, pose: 'standing', say: ask },
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
  const activity = pick(agent.who, random);
  const work: readonly LifeAction[] = [
    { kind: 'wait', steps: random.between(14, 28), pose: restPose(agent.who) },
  ];
  if (activity === 'coffee') {
    return goAndBack(agent, COFFEE, [
      { kind: 'wait', steps: COFFEE_STEPS, pose: 'standing', say: LIFE_TEXT.COFFEE },
    ]);
  }
  if (activity === 'screen' && state.screenHolder === undefined) {
    return goAndBack(agent, screenSpotOf(agent.who), [
      { kind: 'wait', steps: SCREEN_STEPS, pose: 'pointing' },
      { kind: 'release' },
    ]);
  }
  if (activity === 'visit') return visit(agent, state, random) ?? work;
  if (activity === 'stretch') return [{ kind: 'wait', steps: 6, pose: 'standing' }, ...work];
  return work;
}
