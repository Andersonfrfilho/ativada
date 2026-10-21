// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  applyCue,
  BALCONY_REST,
  buildBalconyCycle,
} from '../src/runs/team-room/balcony/balcony-script.js';
import { BALCONY_SLOT, type BalconySlot } from '../src/runs/team-room/balcony/balcony.constant.js';
import { createCueRunner } from '../src/runs/team-room/motion/cue-runner.js';
import { RHYTHM } from '../src/runs/team-room/motion/motion-rhythm.js';
import { createRandom } from '../src/runs/team-room/motion/seeded-random.js';
import { createFakeMotionTimer } from './support/fake-motion-timer.js';

const SLOTS: readonly BalconySlot[] = [
  BALCONY_SLOT.TIAGO,
  BALCONY_SLOT.RENATA,
  BALCONY_SLOT.ALICE,
  BALCONY_SLOT.VITOR,
  BALCONY_SLOT.SOFIA,
  BALCONY_SLOT.OTAVIO,
];

describe('gerador com semente', () => {
  test('the same seed gives the same sequence and stays inside the range', () => {
    const first = createRandom(7);
    const second = createRandom(7);
    const a = Array.from({ length: 20 }, () => first.between(2000, 9000));
    const b = Array.from({ length: 20 }, () => second.between(2000, 9000));
    expect(a).toEqual(b);
    expect(a.every((value) => value >= 2000 && value <= 9000)).toBe(true);
    expect(createRandom(8).next()).not.toBe(createRandom(7).next());
  });

  test('shuffle keeps every item exactly once', () => {
    const shuffled = createRandom(3).shuffle(SLOTS);
    expect([...shuffled].sort()).toEqual([...SLOTS].sort());
  });
});

describe('roteiro da varanda (dado puro)', () => {
  const input = { seed: 11, slots: SLOTS, rhythm: RHYTHM.lively };

  test('is deterministic for the same seed and differs for another', () => {
    expect(buildBalconyCycle(input)).toEqual(buildBalconyCycle(input));
    expect(buildBalconyCycle({ ...input, seed: 12 })).not.toEqual(buildBalconyCycle(input));
  });

  test('each agent speaks exactly once per cycle, one at a time, every turn apart', () => {
    const speaks = buildBalconyCycle(input).cues.flatMap((cue) =>
      cue.payload.kind === 'speak' ? [{ at: cue.at, slot: cue.payload.slot }] : [],
    );
    const speakers = speaks.flatMap((item) => (item.slot === undefined ? [] : [item.slot]));
    expect([...speakers].sort()).toEqual([...SLOTS].sort());
    expect(speaks.at(-1)?.slot).toBeUndefined();
    speaks.forEach((item, index) => expect(item.at).toBe(index * RHYTHM.lively.turnMilliseconds));
  });

  test('replaying the cues never has two speakers and ends with every gesture cleared', () => {
    const cycle = buildBalconyCycle(input);
    let state = BALCONY_REST;
    for (const cue of cycle.cues) {
      state = applyCue(state, cue.payload);
      expect(state.speaker === undefined || SLOTS.includes(state.speaker)).toBe(true);
    }
    expect(state.speaker).toBeUndefined();
    expect(Object.values(state.gestures).every((gesture) => gesture === undefined)).toBe(true);
    expect(cycle.lengthMilliseconds).toBeGreaterThanOrEqual(cycle.cues.at(-1)?.at ?? 0);
  });

  test('gestures come every 2 to 9 s and an agent never starts one inside its own', () => {
    const starts = new Map<BalconySlot, number>();
    const cues = buildBalconyCycle(input).cues;
    for (const cue of cues) {
      const { payload } = cue;
      if (payload.kind !== 'gesture') continue;
      if (payload.gesture === undefined) {
        const began = starts.get(payload.slot);
        expect(began).toBeDefined();
        expect(cue.at - (began ?? 0)).toBe(RHYTHM.lively.gestureMilliseconds);
        starts.delete(payload.slot);
      } else {
        expect(starts.has(payload.slot)).toBe(false);
        starts.set(payload.slot, cue.at);
      }
    }
  });

  test('the calm rhythm doubles the turns and the idle intervals', () => {
    const calm = buildBalconyCycle({ ...input, rhythm: RHYTHM.calm });
    const lively = buildBalconyCycle(input);
    expect(RHYTHM.calm.turnMilliseconds).toBe(RHYTHM.lively.turnMilliseconds * 2);
    expect(RHYTHM.calm.idleMinMilliseconds).toBe(RHYTHM.lively.idleMinMilliseconds * 2);
    expect(calm.lengthMilliseconds).toBeGreaterThan(lively.lengthMilliseconds);
  });

  test('no agents, no cues', () => {
    expect(buildBalconyCycle({ ...input, slots: [] }).cues).toEqual([]);
  });
});

describe('relógio único da cena (cue-runner)', () => {
  function runnerOver(
    cues: readonly number[],
    log: string[],
  ): ReturnType<typeof createFakeMotionTimer> & { runner: ReturnType<typeof createCueRunner> } {
    const fake = createFakeMotionTimer();
    const runner = createCueRunner<string>({
      cycleOf: (cycle) => ({
        cues: cues.map((at) => ({ at, payload: `c${cycle}@${at}` })),
        lengthMilliseconds: 1000,
      }),
      timer: fake.timer,
      onCue: (payload) => log.push(payload),
    });
    return { ...fake, runner };
  }

  test('fires the cues in order, loops the cycles and never holds more than one timer', () => {
    const log: string[] = [];
    const run = runnerOver([100, 400], log);
    run.runner.start();
    expect(run.pending()).toBe(1);
    run.advance(1250);
    expect(log).toEqual(['c0@100', 'c0@400', 'c1@100']);
    expect(run.pending()).toBe(1);
  });

  test('stop cancels the pending timer and nothing else fires', () => {
    const log: string[] = [];
    const run = runnerOver([100], log);
    run.runner.start();
    run.runner.stop();
    expect(run.pending()).toBe(0);
    run.advance(5000);
    expect(log).toEqual([]);
  });
});
