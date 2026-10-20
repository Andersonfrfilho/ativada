// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, render } from '@testing-library/react';

import type { BalconySlot } from '../src/runs/team-room/balcony/balcony.constant.js';
import { CHAT_LINES, CHAT_TURN_STEPS } from '../src/runs/trading-room/office-chat.js';
import { avatarLookOf, avatarPoses } from '../src/runs/trading-room/avatar-poses.js';
import {
  BURN_LINES,
  coffeeVariantOf,
  NO_VARIANT,
  planCoffee,
  SPILL_LINES,
  type CoffeeVariant,
} from '../src/runs/trading-room/office-coffee.js';
import { createRandom } from '../src/runs/team-room/motion/seeded-random.js';
import {
  COFFEE,
  COFFEE_QUEUE,
  COFFEE_SPOTS,
  FLOOR_TOP,
} from '../src/runs/trading-room/office-geometry.js';
import {
  createLife,
  PUDDLE_STEPS,
  startMeeting,
  stepLife,
} from '../src/runs/trading-room/office-life.js';
import type { AgentLife, LifeState, Pose } from '../src/runs/trading-room/office-life.types.js';
import { OfficeFloor } from '../src/runs/trading-room/OfficeFloor.component.js';

// Spec 011, Fase 3: a pausa do café como roteiro de poses (apertar, esperar, pegar, beber, conversar, voltar).

afterEach(cleanup);

const IDLE_FILLER = { kind: 'wait', steps: 400, pose: 'seated' } as const;

function withQueue(state: LifeState, who: BalconySlot, queue: AgentLife['queue']): LifeState {
  return { ...state, agents: state.agents.map((a) => (a.who === who ? { ...a, queue } : a)) };
}

function agentOf(state: LifeState, who: BalconySlot): AgentLife {
  const found = state.agents.find((agent) => agent.who === who);
  if (found === undefined) throw new Error(`missing ${who}`);
  return found;
}

// Só os dois no café: renata (mesa longe) começa, tiago (mesa perto) pede a vez assim que ela pega a máquina.
function runTwoCoffees(steps: number, seed = 5): LifeState[] {
  const crew: BalconySlot[] = ['renata', 'tiago'];
  let state = createLife({ crew, seed, lines: {} });
  const first = planCoffee(agentOf(state, 'renata'), state, {
    home: 'seated',
    variant: NO_VARIANT,
  });
  state = withQueue(withQueue(state, 'renata', first ?? []), 'tiago', [IDLE_FILLER]);
  const states: LifeState[] = [];
  let hasSecond = false;
  for (let index = 0; index < steps; index += 1) {
    state = stepLife(state);
    if (!hasSecond && state.machineHolder === 'renata') {
      const second = planCoffee(agentOf(state, 'tiago'), state, {
        home: 'seated',
        variant: NO_VARIANT,
      });
      state = withQueue(state, 'tiago', second ?? []);
      hasSecond = true;
    }
    states.push(state);
  }
  return states;
}

function isLine(agent: AgentLife): boolean {
  return CHAT_LINES.some((line) => line === agent.speech);
}

// Uma fala de conversa que começou neste passo (a fala nova tem o prazo cheio do turno).
function startsLine(before: LifeState | undefined, after: LifeState): boolean {
  return after.agents.some(
    (a, index) =>
      isLine(a) && a.speechSteps === CHAT_TURN_STEPS && before?.agents[index]?.speech !== a.speech,
  );
}

function atSpots(state: LifeState): AgentLife[] {
  return state.agents.filter((a) => COFFEE_SPOTS.some((p) => p.x === a.at.x && p.y === a.at.y));
}

function phasesOf(states: readonly LifeState[], who: BalconySlot): Pose[] {
  const poses = states.map((state) => agentOf(state, who).pose);
  return poses.filter((pose, index) => pose !== poses[index - 1]);
}

describe('the coffee break script', () => {
  test('one agent goes through walk, press, wait, take, drink and back, with the cup only while away', () => {
    const crew: BalconySlot[] = ['tiago'];
    let state = createLife({ crew, seed: 9, lines: {} });
    state = withQueue(
      state,
      'tiago',
      planCoffee(agentOf(state, 'tiago'), state, { home: 'seated', variant: NO_VARIANT }) ?? [],
    );
    const all: LifeState[] = [];
    for (let index = 0; index < 120; index += 1) {
      state = stepLife(state);
      all.push(state);
    }
    const back = all.findIndex((s, index) => index > 0 && agentOf(s, 'tiago').pose === 'seated');
    const states = all.slice(0, back + 1);
    const phases = phasesOf(states, 'tiago');
    const order = ['walking', 'pressing', 'brewing', 'taking', 'walking', 'drinking', 'holding'];
    let from = 0;
    for (const pose of order) {
      const found = phases.indexOf(pose as Pose, from);
      expect(found).toBeGreaterThanOrEqual(from);
      from = found + 1;
    }
    expect(phases.slice(from)).toContain('walking');
    const taken = states.findIndex((s) => agentOf(s, 'tiago').hasCup);
    expect(taken).toBeGreaterThan(0);
    expect(agentOf(states[taken - 1] ?? state, 'tiago').pose).not.toBe('drinking');
    expect(states.some((s) => agentOf(s, 'tiago').pose === 'drinking')).toBe(true);
    expect(agentOf(states.at(-1) ?? state, 'tiago').hasCup).toBe(false);
    expect(states.every((s) => s.machineHolder === undefined || s.machineHolder === 'tiago')).toBe(
      true,
    );
    expect(states.at(-1)?.machineHolder).toBeUndefined();
  });

  test('two agents never stand on the machine tile together, and the second waits beside it', () => {
    const states = runTwoCoffees(160);
    for (const state of states) {
      expect(
        state.agents.filter((a) => a.at.x === COFFEE.x && a.at.y === COFFEE.y).length,
      ).toBeLessThanOrEqual(1);
    }
    expect(states.some((s) => agentOf(s, 'tiago').pose === 'pressing')).toBe(true);
    const pressing = states.findIndex((s) => agentOf(s, 'tiago').pose === 'pressing');
    const taking = states.findIndex((s) => agentOf(s, 'renata').pose === 'taking');
    expect(pressing).toBeGreaterThan(taking);
  });

  test('the second agent waits on the adjacent tile until the machine is free', () => {
    let state = createLife({ crew: ['renata', 'tiago'], seed: 1, lines: {} });
    const queued = withQueue(state, 'tiago', [
      { kind: 'await_machine' },
      { kind: 'walk', steps: [COFFEE] },
    ]);
    state = {
      ...queued,
      machineHolder: 'renata',
      agents: queued.agents.map((a) =>
        a.who === 'tiago' ? { ...a, at: COFFEE_QUEUE } : { ...a, queue: [IDLE_FILLER] },
      ),
    };
    for (let index = 0; index < 4; index += 1) state = stepLife(state);
    expect(agentOf(state, 'tiago').at).toEqual(COFFEE_QUEUE);
    expect(agentOf(state, 'tiago').pose).toBe('standing');
    state = stepLife({ ...state, machineHolder: undefined });
    expect(agentOf(state, 'tiago').at).toEqual(COFFEE);
    expect(state.machineHolder).toBe('tiago');
  });

  test('they chat one at a time, facing each other, only when both are at the coffee area', () => {
    const states = runTwoCoffees(200);
    const talking = states.filter((s) => s.agents.some(isLine));
    expect(talking.length).toBeGreaterThan(0);
    for (const state of talking) expect(state.agents.filter(isLine).length).toBe(1);
    const started = states.filter((s, index) => startsLine(states[index - 1], s));
    expect(started.length).toBeGreaterThan(1);
    for (const state of started) expect(state.agents.filter(isLine).length).toBe(1);
    expect(new Set(started.flatMap((s) => s.agents.filter(isLine).map((a) => a.who))).size).toBe(2);
    const facing = states.find(
      (s) =>
        talking.includes(s) &&
        agentOf(s, 'tiago').pose === 'holding' &&
        agentOf(s, 'renata').pose === 'holding',
    );
    expect(facing).toBeDefined();
    const [left, right] = [
      agentOf(facing as LifeState, 'tiago'),
      agentOf(facing as LifeState, 'renata'),
    ].sort((a, b) => a.at.x - b.at.x);
    expect(left?.face).toBe('right');
    expect(right?.face).toBe('left');
  });

  test('alone at the coffee area nobody chats, and the same seed repeats the same script', () => {
    const crew: BalconySlot[] = ['tiago', 'renata', 'vitor', 'sofia', 'otavio'];
    for (const seed of [1, 2, 3, 4]) {
      let before = createLife({ crew, seed, lines: {} });
      for (let index = 0; index < 700; index += 1) {
        const state = stepLife(before);
        if (startsLine(before, state)) expect(atSpots(before).length).toBeGreaterThanOrEqual(2);
        expect(
          state.agents.filter((a) => a.at.x === COFFEE.x && a.at.y === COFFEE.y).length,
        ).toBeLessThanOrEqual(1);
        before = state;
      }
    }
    expect(runTwoCoffees(120)).toEqual(runTwoCoffees(120));
    expect(runTwoCoffees(200, 6)).not.toEqual(runTwoCoffees(200));
  });

  test('a meeting drops the cup and frees the machine', () => {
    const states = runTwoCoffees(30);
    const met = startMeeting(states.at(-1) as LifeState);
    expect(met.machineHolder).toBeUndefined();
    expect(met.agents.every((a) => !a.hasCup)).toBe(true);
  });
});

describe('the coffee scene when frozen', () => {
  test('a frozen scene shows the static pose with the cup and no motion attribute', () => {
    const states = runTwoCoffees(90);
    const drinking = states.find((s) =>
      s.agents.some((a) => a.pose === 'drinking' || a.pose === 'holding'),
    );
    const brewing = states.find((s) => s.agents.some((a) => a.pose === 'brewing'));
    const { container } = render(
      <OfficeFloor
        opinions={[]}
        life={drinking ?? (states.at(-1) as LifeState)}
        isMoving={false}
      />,
    );
    expect(container.querySelector('[data-motion]')).toBeNull();
    expect(container.querySelector('[data-look="sip"], [data-look="hold"]')).not.toBeNull();
    expect(container.querySelector('[data-machine="idle"], [data-machine]')).not.toBeNull();
    cleanup();
    const view = render(<OfficeFloor opinions={[]} life={brewing as LifeState} isMoving={false} />);
    expect(view.container.querySelector('[data-machine="brewing"]')).not.toBeNull();
    expect(view.container.querySelector('[data-motion]')).toBeNull();
  });
});

function runVariant(variant: CoffeeVariant, steps = 140): LifeState[] {
  let state = createLife({ crew: ['tiago'], seed: 9, lines: {} });
  state = withQueue(
    state,
    'tiago',
    planCoffee(agentOf(state, 'tiago'), state, { home: 'seated', variant }) ?? [],
  );
  const states: LifeState[] = [];
  for (let index = 0; index < steps; index += 1) {
    state = stepLife(state);
    states.push(state);
  }
  const back = states.findIndex((s, index) => index > 0 && agentOf(s, 'tiago').pose === 'seated');
  return states.slice(0, back + 1);
}

function inOrder(phases: readonly Pose[], order: readonly Pose[]): boolean {
  let from = 0;
  for (const pose of order) {
    const found = phases.indexOf(pose, from);
    if (found < 0) return false;
    from = found + 1;
  }
  return true;
}

describe('coffee mishaps', () => {
  test('burning the tongue: sip, reaction with a bubble and the red tongue, blowing, then drinking', () => {
    const line = BURN_LINES[1];
    const states = runVariant({ kind: 'burn', line });
    const phases = phasesOf(states, 'tiago');
    expect(inOrder(phases, ['drinking', 'burning', 'blowing', 'drinking', 'walking'])).toBe(true);
    expect(states.some((s) => agentOf(s, 'tiago').speech === line)).toBe(true);
    expect(states.every((s) => s.puddle === undefined)).toBe(true);
    expect(avatarLookOf('burning', true)).toBe('burn');
    expect(avatarPoses('tiago').burn.some((run) => run.color === 'tongue')).toBe(true);
    expect(avatarPoses('tiago').blow.some((run) => run.color === 'tongue')).toBe(false);
    expect(avatarPoses('tiago').blow.some((run) => run.color === 'steam')).toBe(true);
  });

  test('spilling: fumble, puddle, embarrassed, back to the machine for a new cup, puddle fades', () => {
    const states = runVariant({ kind: 'spill' }, 200);
    const phases = phasesOf(states, 'tiago');
    expect(
      inOrder(phases, [
        'taking',
        'spilling',
        'embarrassed',
        'walking',
        'pressing',
        'taking',
        'drinking',
      ]),
    ).toBe(true);
    expect(phases).not.toContain('burning');
    const spilled = states.findIndex((s) => s.puddle !== undefined);
    expect(spilled).toBeGreaterThan(0);
    const puddle = states[spilled]?.puddle;
    expect(puddle?.at.y).toBeGreaterThanOrEqual(FLOOR_TOP);
    expect(agentOf(states[spilled] as LifeState, 'tiago').hasCup).toBe(false);
    expect(states.filter((s) => s.puddle !== undefined).length).toBeLessThanOrEqual(PUDDLE_STEPS);
    expect(states.at(-1)?.puddle).toBeUndefined();
    expect(states.some((s) => agentOf(s, 'tiago').speech === SPILL_LINES.OOPS)).toBe(true);
    expect(states.some((s) => agentOf(s, 'tiago').speech === SPILL_LINES.SORRY)).toBe(true);
  });

  test('rare across 1000 seeded breaks, burn more often than spill, never both', () => {
    const kinds = Array.from(
      { length: 1000 },
      (_, seed) => coffeeVariantOf(createRandom(seed + 1)).kind,
    );
    const burn = kinds.filter((kind) => kind === 'burn').length;
    const spill = kinds.filter((kind) => kind === 'spill').length;
    expect(burn).toBeGreaterThanOrEqual(100);
    expect(burn).toBeLessThanOrEqual(300);
    expect(spill).toBeGreaterThanOrEqual(50);
    expect(spill).toBeLessThanOrEqual(150);
    expect(spill).toBeLessThan(burn);
  });

  test('frozen mishaps show static poses and the puddle without any motion attribute', () => {
    const spilled = runVariant({ kind: 'spill' }, 200).find((s) => s.puddle !== undefined);
    const view = render(<OfficeFloor opinions={[]} life={spilled as LifeState} isMoving={false} />);
    expect(view.container.querySelector('[data-motion]')).toBeNull();
    expect(view.container.querySelectorAll('svg').length).toBeGreaterThan(2);
    expect(view.container.querySelector('[data-look="tilt"], [data-look="idle"]')).not.toBeNull();
  });
});
