// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test } from 'bun:test';

import { act, cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';

import {
  OFFICE_LIMITS,
  OFFICE_PHASE,
  OFFICE_PLANS,
  OFFICE_SCENE,
  type OfficePhase,
} from '../src/runs/team-room/office/office.constant.js';
import { sceneOf } from '../src/runs/team-room/office/office-scene.js';
import { createSceneRunner, type SceneClock } from '../src/runs/team-room/office/scene-runner.js';
import {
  useOfficeScene,
  type OfficeSceneParams,
  type OfficeSceneState,
} from '../src/runs/team-room/office/useOfficeScene.hook.js';
import { useOfficeVisibility } from '../src/runs/team-room/office/useOfficeVisibility.hook.js';

afterEach(cleanup);

type FakeClock = SceneClock & { readonly advance: (milliseconds: number) => void };

type FakeTimer = { at: number; callback: () => void; isCancelled: boolean };

// Relógio falso: os temporizadores só disparam quando o teste anda o tempo.
function createFakeClock(): FakeClock {
  let current = 0;
  let timers: FakeTimer[] = [];
  return {
    now: (): number => current,
    setTimer: (callback, milliseconds): (() => void) => {
      const timer = { at: current + milliseconds, callback, isCancelled: false };
      timers.push(timer);
      return (): void => {
        timer.isCancelled = true;
      };
    },
    advance: (milliseconds): void => {
      const target = current + milliseconds;
      for (;;) {
        const due = timers
          .filter((timer) => !timer.isCancelled && timer.at <= target)
          .sort((first, second) => first.at - second.at)[0];
        if (due === undefined) break;
        current = due.at;
        due.isCancelled = true;
        due.callback();
      }
      current = target;
      timers = timers.filter((timer) => !timer.isCancelled);
    },
  };
}

const OUTCOMES = ['waited', 'bought', 'buy_pending', 'sold', 'exited'] as const;

describe('escritório: que cena a vela nova pede', () => {
  test('a lock or the pause posture wins over any signal (no new buy)', () => {
    for (const outcome of OUTCOMES) {
      expect(sceneOf({ outcome, posture: 'pause', hasActiveLock: false })).toBe(
        OFFICE_SCENE.LOCKED,
      );
      expect(sceneOf({ outcome, posture: undefined, hasActiveLock: true })).toBe(
        OFFICE_SCENE.LOCKED,
      );
    }
  });

  test('buy, sell and plain candle map to their own scene', () => {
    const base = { posture: 'normal', hasActiveLock: false } as const;
    expect(sceneOf({ ...base, outcome: 'bought' })).toBe(OFFICE_SCENE.BUY_SIGNAL);
    expect(sceneOf({ ...base, outcome: 'buy_pending' })).toBe(OFFICE_SCENE.BUY_SIGNAL);
    expect(sceneOf({ ...base, outcome: 'sold' })).toBe(OFFICE_SCENE.SELL_SIGNAL);
    expect(sceneOf({ ...base, outcome: 'exited' })).toBe(OFFICE_SCENE.SELL_SIGNAL);
    expect(sceneOf({ ...base, outcome: 'waited' })).toBe(OFFICE_SCENE.NEW_CANDLE);
  });
});

describe('escritório: planos de coreografia', () => {
  test('every scene ends within 2.5 s and its steps are ordered inside the sequence', () => {
    for (const plan of Object.values(OFFICE_PLANS)) {
      expect(plan.endsAt).toBeLessThanOrEqual(OFFICE_LIMITS.MAX_SEQUENCE_MILLISECONDS);
      const times = plan.steps.map((step) => step.at);
      expect(times).toEqual([...times].sort((first, second) => first - second));
      expect(times.every((time) => time < plan.endsAt)).toBe(true);
    }
  });

  test('the new-candle scene runs the meeting: watch, rise, walk, decide, audit, speak', () => {
    const phases = OFFICE_PLANS[OFFICE_SCENE.NEW_CANDLE].steps.map((step) => step.phase);
    expect(phases).toEqual(['watch', 'rise', 'walk', 'decide', 'audit', 'speak']);
  });

  test('the signal scenes raise the sign before the balloons; the lock scene never walks', () => {
    for (const scene of [OFFICE_SCENE.BUY_SIGNAL, OFFICE_SCENE.SELL_SIGNAL]) {
      const phases = OFFICE_PLANS[scene].steps.map((step) => step.phase);
      expect(phases.indexOf(OFFICE_PHASE.SIGN)).toBeGreaterThan(phases.indexOf(OFFICE_PHASE.AUDIT));
      expect(phases.indexOf(OFFICE_PHASE.SIGN)).toBeLessThan(phases.indexOf(OFFICE_PHASE.SPEAK));
    }
    const locked = OFFICE_PLANS[OFFICE_SCENE.LOCKED].steps.map((step) => step.phase);
    expect(locked).toContain(OFFICE_PHASE.LOCK);
    expect(locked).not.toContain(OFFICE_PHASE.WALK);
  });
});

type RunnerRun = {
  readonly clock: FakeClock;
  readonly seen: OfficePhase[][];
  readonly done: () => number;
  readonly runner: ReturnType<typeof createSceneRunner>;
};

function runNewCandle(): RunnerRun {
  const clock = createFakeClock();
  const seen: OfficePhase[][] = [];
  let doneCount = 0;
  const runner = createSceneRunner({
    plan: OFFICE_PLANS[OFFICE_SCENE.NEW_CANDLE],
    clock,
    onPhases: (phases) => seen.push([...phases]),
    onDone: () => {
      doneCount += 1;
    },
  });
  return { clock, seen, done: () => doneCount, runner };
}

describe('escritório: o relógio da coreografia (relógio falso)', () => {
  test('phases accumulate at their times and the end fires once at 2460 ms', () => {
    const { clock, seen, done, runner } = runNewCandle();
    runner.start();
    expect(seen.at(-1)).toEqual(['watch']);
    clock.advance(559);
    expect(seen.at(-1)).toEqual(['watch', 'rise']);
    clock.advance(1);
    expect(seen.at(-1)).toEqual(['watch', 'rise', 'walk']);
    clock.advance(1899);
    expect(seen.at(-1)).toEqual(['watch', 'rise', 'walk', 'decide', 'audit', 'speak']);
    expect(done()).toBe(0);
    clock.advance(1);
    expect(done()).toBe(1);
    clock.advance(5000);
    expect(done()).toBe(1);
  });

  test('pausing freezes the sequence and resuming finishes only what is left', () => {
    const { clock, seen, done, runner } = runNewCandle();
    runner.start();
    clock.advance(1000);
    runner.pause();
    const frozen = seen.length;
    clock.advance(10_000);
    expect(seen.length).toBe(frozen);
    expect(done()).toBe(0);
    runner.resume();
    clock.advance(1459);
    expect(done()).toBe(0);
    clock.advance(1);
    expect(done()).toBe(1);
  });

  test('stopping cancels everything', () => {
    const { clock, done, runner } = runNewCandle();
    runner.start();
    runner.stop();
    clock.advance(5000);
    expect(done()).toBe(0);
  });
});

type SceneProbe = { state: OfficeSceneState | undefined };

function SceneHarness({
  options,
  probe,
}: {
  readonly options: OfficeSceneParams;
  readonly probe: SceneProbe;
}): ReactElement {
  probe.state = useOfficeScene(options);
  return <p data-phases={probe.state.phases.join(' ')} data-running={probe.state.isRunning} />;
}

function optionsOf(
  clock: FakeClock,
  overrides: Partial<OfficeSceneParams> = {},
): OfficeSceneParams {
  return {
    candleKey: 1,
    scene: OFFICE_SCENE.NEW_CANDLE,
    isEnabled: true,
    isAutoPaused: false,
    clock,
    ...overrides,
  };
}

describe('escritório: a coreografia ligada à vela nova', () => {
  test('opening the screen does not animate; a new candle runs one sequence and announces once', () => {
    const clock = createFakeClock();
    const probe: SceneProbe = { state: undefined };
    const view = render(<SceneHarness options={optionsOf(clock)} probe={probe} />);
    expect(probe.state?.isRunning).toBe(false);
    view.rerender(<SceneHarness options={optionsOf(clock, { candleKey: 2 })} probe={probe} />);
    expect(probe.state?.isRunning).toBe(true);
    expect(probe.state?.announcedKey).toBeUndefined();
    act(() => clock.advance(2461));
    expect(probe.state?.isRunning).toBe(false);
    expect(probe.state?.phases).toEqual([]);
    expect(probe.state?.announcedKey).toBe(2);
    expect(probe.state?.isIdle).toBe(true);
    act(() => clock.advance(6400));
    expect(probe.state?.isIdle).toBe(false);
  });

  test('with the animation off the new candle goes straight to the final state', () => {
    const clock = createFakeClock();
    const probe: SceneProbe = { state: undefined };
    const off = { isEnabled: false };
    const view = render(<SceneHarness options={optionsOf(clock, off)} probe={probe} />);
    view.rerender(
      <SceneHarness options={optionsOf(clock, { ...off, candleKey: 2 })} probe={probe} />,
    );
    expect(probe.state?.isRunning).toBe(false);
    expect(probe.state?.announcedKey).toBe(2);
  });

  test('prefers-reduced-motion skips the sequence', () => {
    const original = globalThis.matchMedia;
    globalThis.matchMedia = (): MediaQueryList => ({ matches: true }) as MediaQueryList;
    try {
      const clock = createFakeClock();
      const probe: SceneProbe = { state: undefined };
      const view = render(<SceneHarness options={optionsOf(clock)} probe={probe} />);
      view.rerender(<SceneHarness options={optionsOf(clock, { candleKey: 2 })} probe={probe} />);
      expect(probe.state?.isRunning).toBe(false);
      expect(probe.state?.announcedKey).toBe(2);
    } finally {
      globalThis.matchMedia = original;
    }
  });

  test('pause and continue by hand, and a pause while the office is off the screen', () => {
    const clock = createFakeClock();
    const probe: SceneProbe = { state: undefined };
    const view = render(<SceneHarness options={optionsOf(clock)} probe={probe} />);
    view.rerender(<SceneHarness options={optionsOf(clock, { candleKey: 2 })} probe={probe} />);
    act(() => clock.advance(1000));
    act(() => probe.state?.togglePause());
    expect(probe.state?.isPaused).toBe(true);
    act(() => clock.advance(10_000));
    expect(probe.state?.isRunning).toBe(true);
    act(() => probe.state?.togglePause());
    act(() => clock.advance(1461));
    expect(probe.state?.isRunning).toBe(false);
    const offscreen = { candleKey: 3, isAutoPaused: true };
    view.rerender(<SceneHarness options={optionsOf(clock, offscreen)} probe={probe} />);
    act(() => clock.advance(10_000));
    expect(probe.state?.isRunning).toBe(true);
    view.rerender(
      <SceneHarness
        options={optionsOf(clock, { ...offscreen, isAutoPaused: false })}
        probe={probe}
      />,
    );
    act(() => clock.advance(2461));
    expect(probe.state?.isRunning).toBe(false);
  });
});

type ObserverEntry = { callback: IntersectionObserverCallback };
const observers: ObserverEntry[] = [];

class FakeIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    observers.push({ callback });
  }

  observe(): void {
    return;
  }

  disconnect(): void {
    return;
  }
}

function Visibility(): ReactElement {
  const visibility = useOfficeVisibility();
  return <div ref={visibility.ref} data-paused={visibility.isAutoPaused} />;
}

describe('escritório: pausa fora da tela e com a aba oculta', () => {
  test('the observer pauses when the office leaves the screen and resumes when it returns', () => {
    const original = globalThis.IntersectionObserver;
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      value: FakeIntersectionObserver,
      configurable: true,
    });
    try {
      const view = render(<Visibility />);
      const marker = view.container.querySelector('div');
      expect(marker?.getAttribute('data-paused')).toBe('false');
      const send = (isIntersecting: boolean): void => {
        const entry = { isIntersecting } as IntersectionObserverEntry;
        act(() => observers.at(-1)?.callback([entry], {} as IntersectionObserver));
      };
      send(false);
      expect(marker?.getAttribute('data-paused')).toBe('true');
      send(true);
      expect(marker?.getAttribute('data-paused')).toBe('false');
    } finally {
      Object.defineProperty(globalThis, 'IntersectionObserver', {
        value: original,
        configurable: true,
      });
    }
  });

  test('a hidden tab pauses it', () => {
    const view = render(<Visibility />);
    const marker = view.container.querySelector('div');
    const change = (state: string): void => {
      Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
    };
    change('hidden');
    expect(marker?.getAttribute('data-paused')).toBe('true');
    change('visible');
    expect(marker?.getAttribute('data-paused')).toBe('false');
  });
});

describe('escritório: a folha de estilo do movimento', () => {
  const css = readFileSync(
    fileURLToPath(new URL('../src/runs/team-room/office/Office.module.css', import.meta.url)),
    'utf8',
  );

  test('every animation duration is a motion token and reduced motion removes them all', () => {
    const declarations = [...css.matchAll(/animation:\s*([^;]+);/g)].map((match) => match[1] ?? '');
    expect(declarations.length).toBeGreaterThan(0);
    for (const declaration of declarations) {
      if (declaration === 'none') continue;
      expect(declaration).toMatch(/var\(--motion-(fast|medium|walk)\)/);
    }
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
  });

  test('nothing loops except the three thinking dots', () => {
    const loops = [...css.matchAll(/animation:[^;]*infinite[^;]*;/g)];
    expect(loops).toHaveLength(1);
  });
});
