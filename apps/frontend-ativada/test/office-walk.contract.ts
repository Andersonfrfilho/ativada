// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  blockedFor,
  deskSpecOf,
  FURNITURE,
  isInside,
  keyOf,
  OFFICE_DESKS,
  OFFICE_GRID,
  OFFICE_SPOT,
  OFFICE_WALKERS,
  type Cell,
} from '../src/runs/team-room/office/office-grid.js';
import type { BalconySlot } from '../src/runs/team-room/balcony/balcony.constant.js';
import { routeBetween } from '../src/runs/team-room/office/office-route.js';
import {
  buildOfficeCycle,
  type OfficeMode,
  type OfficePayload,
} from '../src/runs/team-room/office/office-script.js';
import {
  applyOfficeCue,
  SEATED,
  type OfficeWalkState,
} from '../src/runs/team-room/office/office-walk-state.js';
import { RHYTHM } from '../src/runs/team-room/motion/motion-rhythm.js';

const SEEDS = [1, 2, 3, 7, 11, 20_261_018, 20_261_019];

function cycleOf(
  seed: number,
  mode: OfficeMode,
  rhythm = RHYTHM.lively,
): ReturnType<typeof buildOfficeCycle> {
  return buildOfficeCycle({ seed, mode, rhythm });
}

function moves(payloads: readonly OfficePayload[]): readonly { slot: BalconySlot; cell: Cell }[] {
  return payloads.flatMap((payload) =>
    payload.kind === 'move' ? [{ slot: payload.slot, cell: payload.cell }] : [],
  );
}

describe('planta do escritório', () => {
  test('every desk, seat and visit cell is inside the grid, seats and visits are free of furniture', () => {
    for (const spec of OFFICE_DESKS) {
      expect(isInside(spec.seat)).toBe(true);
      expect(isInside(spec.visit)).toBe(true);
      expect(isInside({ x: spec.desk.x + 1, y: spec.desk.y })).toBe(true);
      expect(FURNITURE.has(keyOf(spec.seat))).toBe(false);
      expect(FURNITURE.has(keyOf(spec.visit))).toBe(false);
    }
    expect(OFFICE_GRID.columns * OFFICE_GRID.rows).toBe(140);
  });

  test('the desks never overlap each other', () => {
    const cells = OFFICE_DESKS.flatMap((spec) => [
      keyOf(spec.desk),
      keyOf({ x: spec.desk.x + 1, y: spec.desk.y }),
    ]);
    expect(new Set(cells).size).toBe(cells.length);
  });

  test('every stopping place is reachable from every seat and the spare board spot is free', () => {
    const spots = [...OFFICE_SPOT.BOARD, ...OFFICE_SPOT.ALICE, ...OFFICE_SPOT.MEETING];
    for (const slot of OFFICE_WALKERS) {
      const seat = deskSpecOf(slot)?.seat;
      for (const spot of spots) {
        expect(seat && routeBetween(seat, spot, blockedFor(slot))).toBeDefined();
      }
    }
    expect(FURNITURE.has(keyOf(OFFICE_SPOT.BOARD_EXTENSION))).toBe(false);
  });
});

describe('rotas pela grade', () => {
  test('goes around furniture in the shortest way, one cell per step', () => {
    const route = routeBetween({ x: 4, y: 2 }, { x: 7, y: 2 }, FURNITURE);
    expect(route).toBeDefined();
    expect(route?.some((cell) => FURNITURE.has(keyOf(cell)))).toBe(false);
    expect(route?.at(-1)).toEqual({ x: 7, y: 2 });
  });

  test('an unreachable place has no route and the same place has an empty one', () => {
    const wall = new Set([keyOf({ x: 1, y: 0 }), keyOf({ x: 0, y: 1 })]);
    expect(routeBetween({ x: 0, y: 0 }, { x: 5, y: 5 }, wall)).toBeUndefined();
    expect(routeBetween({ x: 3, y: 3 }, { x: 3, y: 3 }, wall)).toEqual([]);
  });
});

describe('roteiro de movimento (dado puro)', () => {
  const modes: readonly OfficeMode[] = ['idle', 'meeting'];

  test('is deterministic with the same seed and changes with another', () => {
    for (const mode of modes) {
      expect(cycleOf(5, mode)).toEqual(cycleOf(5, mode));
    }
    expect(cycleOf(5, 'idle')).not.toEqual(cycleOf(6, 'idle'));
  });

  test('no step ever lands on a desk, a plant or somebody else seat, and steps are one cell apart', () => {
    for (const mode of modes) {
      for (const seed of SEEDS) {
        const last = new Map<BalconySlot, Cell>();
        for (const cue of cycleOf(seed, mode).cues) {
          for (const move of moves([cue.payload])) {
            expect(isInside(move.cell)).toBe(true);
            expect(blockedFor(move.slot).has(keyOf(move.cell))).toBe(false);
            const before = last.get(move.slot) ?? deskSpecOf(move.slot)?.seat;
            const gap =
              Math.abs((before?.x ?? 0) - move.cell.x) + Math.abs((before?.y ?? 0) - move.cell.y);
            expect(gap).toBeLessThanOrEqual(1);
            last.set(move.slot, move.cell);
          }
        }
      }
    }
  });

  test('everybody is back in the own seat, sitting, when the cycle ends', () => {
    for (const mode of modes) {
      for (const seed of SEEDS) {
        let state: OfficeWalkState = SEATED;
        for (const cue of cycleOf(seed, mode).cues) state = applyOfficeCue(state, cue.payload);
        expect(state).toEqual(SEATED);
      }
    }
  });

  test('cues come in time order, inside the cycle, and start with a reset to the seats', () => {
    for (const mode of modes) {
      const cycle = cycleOf(9, mode);
      expect(cycle.cues[0]?.payload.kind).toBe('reset');
      const times = cycle.cues.map((cue) => cue.at);
      expect([...times].sort((a, b) => a - b)).toEqual(times);
      expect(cycle.lengthMilliseconds).toBeGreaterThanOrEqual(times.at(-1) ?? 0);
    }
  });

  test('idle: only one person is away from the seat at a time', () => {
    for (const seed of SEEDS) {
      let state: OfficeWalkState = SEATED;
      for (const cue of cycleOf(seed, 'idle').cues) {
        state = applyOfficeCue(state, cue.payload);
        const away = OFFICE_DESKS.filter((spec) => {
          const placed = state[spec.slot];
          return placed !== undefined && keyOf(placed.cell) !== keyOf(spec.seat);
        });
        expect(away.length).toBeLessThanOrEqual(1);
      }
    }
  });

  test('meeting: the five other rule agents gather at distinct places and Alice stays at her desk', () => {
    const reached = new Set<string>();
    const meetingCells = new Set(OFFICE_SPOT.MEETING.map(keyOf));
    const cycle = cycleOf(3, 'meeting');
    for (const cue of cycle.cues) {
      for (const move of moves([cue.payload])) {
        if (meetingCells.has(keyOf(move.cell))) reached.add(move.slot);
        if (move.slot === 'alice') expect(move.cell).toEqual(deskSpecOf('alice')?.seat);
      }
    }
    expect([...reached].sort()).toEqual(['otavio', 'renata', 'sofia', 'tiago', 'vitor']);
    expect(cycle.lengthMilliseconds).toBeGreaterThanOrEqual(RHYTHM.lively.meetingMilliseconds);
  });

  test('the calm rhythm walks slower and meets for longer', () => {
    const lively = cycleOf(3, 'meeting', RHYTHM.lively);
    const calm = cycleOf(3, 'meeting', RHYTHM.calm);
    expect(calm.lengthMilliseconds).toBeGreaterThan(lively.lengthMilliseconds);
    expect(RHYTHM.calm.stepMilliseconds).toBeGreaterThan(RHYTHM.lively.stepMilliseconds);
  });
});
