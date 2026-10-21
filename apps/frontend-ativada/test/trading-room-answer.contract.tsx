// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, render } from '@testing-library/react';

import type { BalconySlot } from '../src/runs/team-room/balcony/balcony.constant.js';
import { answerOf, startAnswer } from '../src/runs/trading-room/office-answer.js';
import { FLOOR_TOP, screenSpotOf, seatOf } from '../src/runs/trading-room/office-geometry.js';
import { footprintOf, isSamePoint, tileOf } from '../src/runs/trading-room/office-grid.js';
import {
  createLife,
  speakerOf,
  startMeeting,
  stepLife,
} from '../src/runs/trading-room/office-life.js';
import type { LifeState } from '../src/runs/trading-room/office-life.types.js';
import { canStand, floorMaskOf } from '../src/runs/trading-room/office-mask.js';
import { OfficeFloor } from '../src/runs/trading-room/OfficeFloor.component.js';
import type { RoomOpinion } from '../src/runs/trading-room/room-opinions.js';

// "Pergunte à equipe": a atividade `answer` da vida no escritório, pura e com semente.

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
const MASK = floorMaskOf(CREW);
const SEEDS = [1, 2, 3, 4, 5, 6] as const;
const TEXT =
  'Em ETHUSDT, pela EMA 9×21, a tendência está de alta e a regra vota a favor da compra.';
const LIMIT = 300;

function request(who: BalconySlot, key = 1): Parameters<typeof startAnswer>[1] {
  return { key, who, question: 'Como está a tendência?', text: TEXT };
}

function warmed(seed: number, steps: number): LifeState {
  let state = createLife({ crew: CREW, seed, lines: {} });
  for (let index = 0; index < steps; index += 1) state = stepLife(state);
  return state;
}

function run(state: LifeState, steps: number): LifeState[] {
  const states: LifeState[] = [];
  let current = state;
  for (let index = 0; index < steps; index += 1) {
    current = stepLife(current);
    states.push(current);
  }
  return states;
}

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

describe('the answer activity', () => {
  test('whoever answers reaches the front of the screen, points and owns the bubble; nobody collides', () => {
    for (const seed of SEEDS) {
      for (const who of ['renata', 'vitor', 'otavio'] as const) {
        const states = run(startAnswer(warmed(seed, 90), request(who)), LIMIT);
        const speaking = states.findIndex(
          (state) => answerOf(state, speakerOf(state)) !== undefined,
        );
        expect(speaking).toBeGreaterThanOrEqual(0);
        const at = states[speaking];
        const agent = at?.agents.find((item) => item.who === who);
        expect(agent?.at.y).toBe(FLOOR_TOP);
        expect(agent?.pose).toBe('pointing');
        expect(at?.screenHolder).toBe(who);
        for (const state of states) {
          expect(sharedTiles(state)).toBe(0);
          expect(
            state.agents.filter((item) => item.pose === 'pointing').length,
          ).toBeLessThanOrEqual(1);
          for (const item of state.agents) {
            const tile = tileOf(item.at);
            expect(canStand(MASK, item.who, { tile, machineHolder: state.machineHolder })).toBe(
              true,
            );
          }
        }
      }
    }
  });

  test('on its own screen spot, then back to the seat; the answer ends with the release', () => {
    const states = run(
      startAnswer(createLife({ crew: CREW, seed: 9, lines: {} }), request('renata')),
      LIMIT,
    );
    const speaking = states.find((state) => answerOf(state, speakerOf(state)) !== undefined);
    const renata = speaking?.agents.find((agent) => agent.who === 'renata');
    expect(renata?.at).toEqual(screenSpotOf('renata'));
    const done = states.findIndex((state, index) => index > 0 && state.answer === undefined);
    expect(done).toBeGreaterThan(0);
    const last = states.at(-1)?.agents.find((agent) => agent.who === 'renata');
    expect(last !== undefined && isSamePoint(last.at, seatOf('renata'))).toBe(true);
  });

  test('the same seed gives the same answer walk; an agent outside the room does not answer', () => {
    const first = run(startAnswer(warmed(4, 30), request('tiago')), 120);
    const again = run(startAnswer(warmed(4, 30), request('tiago')), 120);
    expect(again).toEqual(first);
    const room = createLife({ crew: ['alice', 'otavio'], seed: 1, lines: {} });
    expect(startAnswer(room, request('tiago'))).toBe(room);
  });

  test('the meeting comes first; the answer is scheduled again after it', () => {
    const asked = startAnswer(warmed(2, 40), request('sofia'));
    const states = run(startMeeting(stepLife(asked)), 600);
    const meetingEnd = states.findIndex((state) => state.meeting === undefined);
    expect(meetingEnd).toBeGreaterThan(0);
    const speaking = states.findIndex((state) => answerOf(state, speakerOf(state)) !== undefined);
    expect(speaking).toBeGreaterThan(meetingEnd);
  });

  test('the big bubble shows the answer text while the agent points at the screen', () => {
    const states = run(startAnswer(warmed(3, 20), request('renata')), LIMIT);
    const speaking = states.find((state) => answerOf(state, speakerOf(state)) !== undefined);
    if (speaking === undefined) throw new Error('ninguém respondeu');
    const opinions: readonly RoomOpinion[] = CREW.map((slot) => ({
      slot,
      name: slot === 'renata' ? 'Renata' : slot,
      role: 'Reversão',
      kind: 'rule',
      intent: { tone: 'neutral', icon: 'info', word: 'sem leitura' },
      isOut: false,
      line: undefined,
      rows: [],
      note: undefined,
      confidence: null,
      wallet: undefined,
    }));
    const { container } = render(<OfficeFloor opinions={opinions} life={speaking} isMoving />);
    expect(container.textContent).toContain(TEXT);
    expect(container.textContent).toContain('Como está a tendência?');
  });
});
