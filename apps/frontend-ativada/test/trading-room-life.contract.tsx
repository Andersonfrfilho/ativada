// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { act, cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';

import type { BalconySlot } from '../src/runs/team-room/balcony/balcony.constant.js';
import { MotionClockProvider } from '../src/runs/team-room/motion/MotionClock.context.js';
import { FLOOR_TOP, gatherSpot, seatOf } from '../src/runs/trading-room/office-geometry.js';
import {
  BANNER_STEPS,
  createLife,
  startMeeting,
  STEP_MILLISECONDS,
  stepLife,
} from '../src/runs/trading-room/office-life.js';
import type { LifeState } from '../src/runs/trading-room/office-life.types.js';
import { useOfficeLife } from '../src/runs/trading-room/useOfficeLife.hook.js';
import { createFakeMotionTimer } from './support/fake-motion-timer.js';

// Spec 011, Fase 3, S4: a vida no escritório como dado puro, com semente, e o relógio único da cena.

afterEach(cleanup);

const CREW: readonly BalconySlot[] = [
  'tiago',
  'renata',
  'alice',
  'vitor',
  'sofia',
  'otavio',
  'olivia',
];
const LINES = { tiago: { name: 'Tiago', line: 'a favor: EMA rápida acima' } };

function run(state: LifeState, steps: number): LifeState[] {
  const states: LifeState[] = [];
  let current = state;
  for (let index = 0; index < steps; index += 1) {
    current = stepLife(current);
    states.push(current);
  }
  return states;
}

describe('office life script', () => {
  test('the same seed gives the same sequence; another seed gives another', () => {
    const first = run(createLife({ crew: CREW, seed: 7, lines: LINES }), 300);
    const again = run(createLife({ crew: CREW, seed: 7, lines: LINES }), 300);
    const other = run(createLife({ crew: CREW, seed: 8, lines: LINES }), 300);
    expect(again).toEqual(first);
    expect(other.map((state) => state.agents)).not.toEqual(first.map((state) => state.agents));
  });

  test('every move is at most one tile, nobody climbs into the screen, one at the screen at a time', () => {
    const states = run(createLife({ crew: CREW, seed: 11, lines: LINES }), 600);
    states.reduce((before, after) => {
      after.agents.forEach((agent, index) => {
        const prior = before.agents[index];
        const distance = Math.max(
          Math.abs(agent.at.x - (prior?.at.x ?? 0)),
          Math.abs(agent.at.y - (prior?.at.y ?? 0)),
        );
        expect(distance).toBeLessThanOrEqual(32);
        expect(agent.at.y).toBeGreaterThanOrEqual(FLOOR_TOP);
      });
      expect(after.agents.filter((agent) => agent.pose === 'pointing').length).toBeLessThanOrEqual(
        1,
      );
      return after;
    });
    expect(states.some((state) => state.agents.some((agent) => agent.pose === 'walking'))).toBe(
      true,
    );
  });

  test('the meeting gathers everyone in front of the screen, shows the banner and sends each one back to the seat', () => {
    const meeting = startMeeting(
      run(createLife({ crew: CREW, seed: 3, lines: LINES }), 40).at(-1) ??
        createLife({ crew: CREW, seed: 3, lines: {} }),
    );
    const states = run(meeting, 400);
    const banner = states.find((state) => state.meeting?.phase === 'banner');
    expect(banner?.agents.map((agent) => agent.at)).toEqual(
      CREW.map((_, index) => gatherSpot(index, CREW.length)),
    );
    expect(
      states.filter((state) => state.meeting?.phase === 'banner').length,
    ).toBeGreaterThanOrEqual(BANNER_STEPS - 1);
    const done = states.findIndex(
      (state, index) =>
        index > 0 && state.meeting === undefined && states[index - 1]?.meeting !== undefined,
    );
    expect(done).toBeGreaterThan(0);
    expect(states[done - 1]?.agents.map((agent) => agent.at)).toEqual(
      CREW.map((who) => seatOf(who)),
    );
  });
});

function Probe({
  isMoving,
  decisionKey,
}: {
  readonly isMoving: boolean;
  readonly decisionKey: number;
}): ReactElement {
  const life = useOfficeLife({ crew: CREW, lines: LINES, decisionKey, isMoving });
  return <p data-testid="life">{`${life.tick}:${life.meeting?.phase ?? 'none'}`}</p>;
}

describe('the scene clock', () => {
  test('frozen (Calmo or reduced motion) schedules nothing and keeps everyone seated', () => {
    const clock = createFakeMotionTimer();
    const { getByTestId } = render(
      <MotionClockProvider timer={clock.timer}>
        <Probe isMoving={false} decisionKey={1} />
      </MotionClockProvider>,
    );
    expect(clock.pending()).toBe(0);
    act(() => clock.advance(STEP_MILLISECONDS * 10));
    expect(getByTestId('life').textContent).toBe('0:none');
  });

  test('moving keeps exactly one timer and a new decision starts the meeting', () => {
    const clock = createFakeMotionTimer();
    const view = (decisionKey: number): ReactElement => (
      <MotionClockProvider timer={clock.timer}>
        <Probe isMoving decisionKey={decisionKey} />
      </MotionClockProvider>
    );
    const { getByTestId, rerender } = render(view(1));
    expect(clock.pending()).toBe(1);
    for (let step = 0; step < 5; step += 1) act(() => clock.advance(STEP_MILLISECONDS));
    expect(getByTestId('life').textContent).toBe('5:none');
    expect(clock.pending()).toBe(1);
    rerender(view(2));
    act(() => clock.advance(STEP_MILLISECONDS));
    expect(getByTestId('life').textContent).toContain('gathering');
  });
});
