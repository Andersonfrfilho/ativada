// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, render } from '@testing-library/react';

import type { BalconySlot } from '../src/runs/team-room/balcony/balcony.constant.js';
import { CHAT_LINES } from '../src/runs/trading-room/office-chat.js';
import {
  COFFEE,
  COFFEE_CORNER,
  COFFEE_SPOTS,
  FIGURE,
  gatherSpot,
  screenSpotOf,
} from '../src/runs/trading-room/office-geometry.js';
import {
  footprintOf,
  isSamePoint,
  pointOf,
  tileOf,
  type Point,
} from '../src/runs/trading-room/office-grid.js';
import { createLife, startMeeting, stepLife } from '../src/runs/trading-room/office-life.js';
import type { LifeState, Pose } from '../src/runs/trading-room/office-life.types.js';
import { canStand, floorMaskOf } from '../src/runs/trading-room/office-mask.js';
import { isCleanStep, stepsToward } from '../src/runs/trading-room/office-path.js';
import { OfficeFloor } from '../src/runs/trading-room/OfficeFloor.component.js';

// A sala sem atravessar ninguém: um agente por ladrilho, nada sobre móvel, um ladrilho por passo, a pausa do café na ordem.

afterEach(cleanup);

const CREW: readonly BalconySlot[] = [
  'tiago',
  'renata',
  'alice',
  'vitor',
  'sofia',
  'otavio',
  'nina',
  'lucas',
  'olivia',
];
const SEEDS = [1, 2, 3, 4] as const;
const STEPS = 2_000;
const MASK = floorMaskOf(CREW);

// O que pode vir logo depois de cada pose da pausa do café (e o que precisa ter vindo antes).
const NEXT: Readonly<Partial<Record<Pose, readonly Pose[]>>> = {
  reaching: ['pressing'],
  pressing: ['brewing'],
  brewing: ['taking'],
  taking: ['holding'],
  raising: ['drinking', 'blowing'],
  blowing: ['raising', 'drinking'],
  drinking: ['lowering', 'burning'],
  burning: ['blowing'],
};
const PREVIOUS: Readonly<Partial<Record<Pose, readonly Pose[]>>> = {
  pressing: ['reaching'],
  brewing: ['pressing'],
  taking: ['brewing'],
  burning: ['drinking'],
  lowering: ['drinking'],
};

function simulate(seed: number, withMeetings: boolean): readonly LifeState[] {
  const states: LifeState[] = [];
  let state = createLife({ crew: CREW, seed, lines: {} });
  for (let index = 0; index < STEPS; index += 1) {
    if (withMeetings && index % 600 === 599) state = startMeeting(state);
    state = stepLife(state);
    states.push(state);
  }
  return states;
}

const RUNS = SEEDS.map((seed) => ({ seed, states: simulate(seed, false) }));
const MEETING_RUNS = SEEDS.map((seed) => simulate(seed, true));

function sharedTiles(state: LifeState): number {
  const seen = new Set<string>();
  let shared = 0;
  for (const agent of state.agents) {
    for (const key of footprintOf(agent.at)) {
      if (seen.has(key)) shared += 1;
      seen.add(key);
    }
  }
  return shared;
}

function posesOf(states: readonly LifeState[], index: number): readonly Pose[] {
  const poses = states.map((state) => state.agents[index]?.pose ?? 'seated');
  return poses.filter((pose, at) => pose !== poses[at - 1]);
}

function atCorner(state: LifeState): number {
  return state.agents.filter((agent) => COFFEE_SPOTS.some((spot) => isSamePoint(spot, agent.at)))
    .length;
}

describe('collisions over 2.000 seeded steps for every seed', () => {
  test('no two agents share a tile, nobody stands on a blocked tile, nobody teleports', () => {
    for (const states of [...RUNS.map((run) => run.states), ...MEETING_RUNS]) {
      let before = states[0];
      for (const state of states) {
        expect(sharedTiles(state)).toBe(0);
        for (const [index, agent] of state.agents.entries()) {
          const tile = tileOf(agent.at);
          expect(canStand(MASK, agent.who, { tile, machineHolder: state.machineHolder })).toBe(
            true,
          );
          const prior = before?.agents[index]?.at ?? agent.at;
          expect(
            Math.max(Math.abs(prior.x - agent.at.x), Math.abs(prior.y - agent.at.y)),
          ).toBeLessThanOrEqual(32);
        }
        before = state;
      }
    }
  });

  test('the coffee break keeps its order and the machine holds one person, its holder', () => {
    for (const { states } of RUNS) {
      for (const state of states) {
        const onMachine = state.agents.filter((agent) => isSamePoint(agent.at, COFFEE));
        expect(onMachine.length).toBeLessThanOrEqual(1);
        if (onMachine[0] !== undefined) expect(onMachine[0].who === state.machineHolder).toBe(true);
      }
      CREW.forEach((_, index) => {
        const poses = posesOf(states, index);
        poses.forEach((pose, at) => {
          const next = poses[at + 1];
          const allowed = NEXT[pose];
          if (allowed !== undefined && next !== undefined) expect(allowed).toContain(next);
          const needed = PREVIOUS[pose];
          if (needed !== undefined) expect(needed).toContain(poses[at - 1] ?? 'seated');
        });
      });
    }
    const all = RUNS.flatMap((run) => CREW.flatMap((_, index) => posesOf(run.states, index)));
    expect(all).toContain('pressing');
    expect(all).toContain('drinking');
  });

  test('a coffee chat line only starts with two people standing at the corner', () => {
    let lines = 0;
    for (const { states } of RUNS) {
      states.forEach((state, at) => {
        const before = states[at - 1];
        const starts = state.agents.some(
          (agent, index) =>
            CHAT_LINES.some((line) => line === agent.speech) &&
            before?.agents[index]?.speech !== agent.speech,
        );
        if (!starts || before === undefined) return;
        lines += 1;
        expect(atCorner(before)).toBeGreaterThanOrEqual(2);
      });
    }
    expect(lines).toBeGreaterThan(0);
  });

  test('the meeting gathers everyone on distinct tiles in front of the screen', () => {
    const spots = CREW.map((_, index) => gatherSpot(index, CREW.length));
    const keys = spots.flatMap((spot) => footprintOf(spot));
    expect(new Set(keys).size).toBe(keys.length);
    for (const spot of spots) expect(MASK.isTransit(tileOf(spot))).toBe(true);
    for (const who of CREW) expect(MASK.isTransit(tileOf(screenSpotOf(who)))).toBe(true);
  });
});

describe('the walkable grid', () => {
  test('a diagonal step never cuts the corner of a blocked tile', () => {
    for (let r = 0; r < 15; r += 1) {
      for (let c = 0; c < 49; c += 1) {
        for (const next of stepsToward(MASK, { c, r }, tileOf(COFFEE_SPOTS[0] ?? COFFEE))) {
          if (next.c === c || next.r === r) continue;
          expect(MASK.isTransit({ c: next.c, r })).toBe(true);
          expect(MASK.isTransit({ c, r: next.r })).toBe(true);
        }
      }
    }
    const desk = { c: 4, r: 6 };
    expect(MASK.isTransit(desk)).toBe(false);
    expect(isCleanStep(MASK, { c: 3, r: 5 }, { c: 4, r: 6 })).toBe(false);
  });

  test('the coffee counter, the desks and the lectern are blocked; the corridor in front of the screen is free', () => {
    expect(MASK.isTransit({ c: 2, r: 0 })).toBe(false);
    expect(MASK.isTransit(tileOf(COFFEE))).toBe(false);
    expect(MASK.isTransit({ c: 24, r: 13 })).toBe(false);
    for (let c = 6; c < 48; c += 1) expect(MASK.isTransit({ c, r: 0 })).toBe(true);
  });
});

function overlaps(a: { x: number; y: number; w: number; h: number }, b: typeof a): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe('bubbles and the coffee corner', () => {
  test('the opinion bubble of anyone at the screen stays clear of the coffee corner', () => {
    const corner = { x: 0, y: 340, w: COFFEE_CORNER.width, h: COFFEE_CORNER.height };
    for (const who of CREW) {
      const spot: Point = screenSpotOf(who);
      const left = spot.x < 800 ? spot.x + FIGURE.width + 10 : spot.x - 10 - 430;
      expect(overlaps({ x: left, y: 452, w: 430, h: 300 }, corner)).toBe(false);
    }
  });

  test('frozen, the floor carries no motion attribute anywhere', () => {
    const state = RUNS[0]?.states.find((s) => s.agents.some((a) => a.pose === 'walking'));
    const { container } = render(
      <OfficeFloor
        opinions={[]}
        life={state ?? createLife({ crew: CREW, seed: 1, lines: {} })}
        isMoving={false}
      />,
    );
    expect(container.querySelector('[data-motion], [data-anim]')).toBeNull();
    expect(container.querySelector('[data-look="walk"]')).toBeNull();
    expect(pointOf({ c: 0, r: 0 }).y).toBe(444);
  });
});
