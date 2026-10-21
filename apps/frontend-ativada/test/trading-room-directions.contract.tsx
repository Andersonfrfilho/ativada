// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, render } from '@testing-library/react';

import { avatarLookOf, viewOf } from '../src/runs/trading-room/avatar-look.js';
import { IDLE_FRONT, spriteOf } from '../src/runs/trading-room/avatar-poses.js';
import { seatOf } from '../src/runs/trading-room/office-geometry.js';
import { facingOf, pointOf, type Facing } from '../src/runs/trading-room/office-grid.js';
import { createLife, stepLife } from '../src/runs/trading-room/office-life.js';
import type { AgentLife } from '../src/runs/trading-room/office-life.types.js';
import { OfficeAgent } from '../src/runs/trading-room/OfficeAgent.component.js';

// Os bonecos em 8 direções: a direção sai do vetor de cada passo, a caminhada tem 8 quadros (4 por passada) e as vistas de
// costas mostram cabelo e roupa, nunca o rosto.

afterEach(cleanup);

const VECTORS: readonly (readonly [number, number, Facing])[] = [
  [0, -1, 'n'],
  [1, -1, 'ne'],
  [1, 0, 'e'],
  [1, 1, 'se'],
  [0, 1, 's'],
  [-1, 1, 'sw'],
  [-1, 0, 'w'],
  [-1, -1, 'nw'],
];

const WALKER: AgentLife = {
  who: 'tiago',
  at: pointOf({ c: 12, r: 1 }),
  pose: 'walking',
  face: 'e',
  hasCup: false,
  queue: [],
  speech: undefined,
  speechSteps: 0,
  stride: 0,
};

describe('eight facing directions', () => {
  test('each of the 8 step vectors gives its own facing; standing still keeps the last one', () => {
    const from = pointOf({ c: 10, r: 5 });
    for (const [dc, dr, facing] of VECTORS) {
      expect(facingOf(from, { x: from.x + dc * 32, y: from.y + dr * 32 }, 's')).toBe(facing);
    }
    expect(facingOf(from, from, 'nw')).toBe('nw');
  });

  test('five views are drawn and west, south-west and north-west mirror them', () => {
    const views = VECTORS.map(([, , facing]) => viewOf(facing));
    expect(new Set(views.map((item) => item.view))).toEqual(new Set(['n', 'ne', 'e', 'se', 's']));
    expect(views.filter((item) => item.isMirrored).length).toBe(3);
    expect(viewOf('w')).toEqual({ view: 'e', isMirrored: true });
  });

  test('back views show hair and outfit, never eyes or mouth; front views show the face', () => {
    for (const who of ['tiago', 'sofia', 'nina', 'otavio'] as const) {
      for (const view of ['n', 'ne'] as const) {
        const colors = new Set(spriteOf(who, { ...IDLE_FRONT, view }).map((run) => run.color));
        expect(colors.has('eye')).toBe(false);
        expect(colors.has('mouth')).toBe(false);
        expect(colors.has('hair')).toBe(true);
        expect(colors.has('cloth')).toBe(true);
      }
      for (const view of ['s', 'se', 'e'] as const) {
        const colors = new Set(spriteOf(who, { ...IDLE_FRONT, view }).map((run) => run.color));
        expect(colors.has('eye')).toBe(true);
      }
    }
  });
});

describe('the walk cycle', () => {
  test('every step advances the stride by two frames, and the 8 frames per view all differ', () => {
    let state = createLife({ crew: ['tiago'], seed: 3, lines: {} });
    const seat = seatOf('tiago');
    state = {
      ...state,
      agents: state.agents.map((agent) => ({
        ...agent,
        queue: [{ kind: 'walk', to: pointOf({ c: 30, r: 1 }) }],
      })),
    };
    const strides: number[] = [];
    for (let index = 0; index < 12; index += 1) {
      state = stepLife(state);
      const agent = state.agents[0];
      if (agent?.pose === 'walking') strides.push(agent.stride);
    }
    expect(strides.length).toBeGreaterThan(8);
    strides.forEach((stride, index) => {
      if (index > 0) expect(stride).toBe(((strides[index - 1] ?? 0) + 2) % 8);
    });
    expect(state.agents[0]?.at).not.toEqual(seat);
    for (const view of ['s', 'se', 'e', 'ne', 'n'] as const) {
      const frames = Array.from({ length: 8 }, (_, legs) =>
        JSON.stringify(
          spriteOf('tiago', { ...IDLE_FRONT, view, legs, arm: 'swing', swing: legs < 4 ? 1 : -1 }),
        ),
      );
      expect(new Set(frames).size).toBeGreaterThanOrEqual(4);
    }
  });

  test('arms swing opposite to the legs: the first and second half of the stride mirror the swing', () => {
    const first = avatarLookOf({ ...WALKER, stride: 0 }, true);
    const second = avatarLookOf({ ...WALKER, stride: 4 }, true);
    expect(first.main.swing).toBe(1);
    expect(second.main.swing).toBe(-1);
    expect(first.alt?.legs).toBe(1);
    expect(first.animation).toBe('walk');
  });

  test('frozen, a walker is drawn as the static idle frame of its direction with no motion attributes', () => {
    const { container } = render(
      <OfficeAgent agent={{ ...WALKER, face: 'w' }} name="Tiago" isMoving={false} />,
    );
    const agent = container.querySelector('[data-pose]');
    expect(agent?.getAttribute('data-look')).toBe('idle');
    expect(agent?.getAttribute('data-anim')).toBeNull();
    expect(agent?.getAttribute('data-mirror')).toBe('true');
    expect(container.querySelectorAll('svg g').length).toBe(1);
    cleanup();
    const moving = render(<OfficeAgent agent={WALKER} name="Tiago" isMoving />);
    expect(moving.container.querySelector('[data-anim="walk"]')).not.toBeNull();
    expect(moving.container.querySelectorAll('svg g').length).toBe(2);
  });

  test('seated agents face the room and type; at the screen they point from the back', () => {
    const seated = avatarLookOf({ ...WALKER, pose: 'seated', face: 's' }, true);
    expect(seated.name).toBe('type');
    expect(seated.main.view).toBe('s');
    const pointing = avatarLookOf({ ...WALKER, pose: 'pointing', face: 'n' }, true);
    expect(pointing.main.view).toBe('n');
    expect(pointing.main.arm).toBe('point');
  });
});
