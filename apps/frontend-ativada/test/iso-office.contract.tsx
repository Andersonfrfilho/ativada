// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readFileSync } from 'node:fs';
import type { ReactElement } from 'react';

import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'bun:test';

import { useLiveStream } from '../src/live/useLiveStream.hook.js';
import { RHYTHM } from '../src/runs/team-room/motion/motion-rhythm.js';
import { MotionClockProvider } from '../src/runs/team-room/motion/MotionClock.context.js';
import { FURNITURE, keyOf, OFFICE_DESKS } from '../src/runs/team-room/office/office-grid.js';
import { TeamRoomSection } from '../src/runs/team-room/TeamRoomSection.component.js';
import { TEAM_ROOM_STORAGE_KEY } from '../src/runs/team-room/team-room.constant.js';
import { useTeamRoomPreference } from '../src/runs/team-room/useTeamRoomPreference.hook.js';
import { LIVE_RUN_ID } from './support/live-tracking-harness.js';
import { createFakeMotionTimer, type FakeMotionTimer } from './support/fake-motion-timer.js';
import {
  buildRunModelTeams,
  buildTeamState,
  buildTeamView,
  createModelTeamsHarness,
  modelTeamsRoutes,
} from './support/model-teams-fixtures.js';
import { renderApp } from './support/render-app.js';
import { createRoomHarness, roomRoutes } from './support/team-room-fixtures.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function noop(): void {
  return;
}

function Room(): ReactElement {
  const { preference, update } = useTeamRoomPreference();
  useLiveStream(noop, noop);
  return (
    <TeamRoomSection
      runId={LIVE_RUN_ID}
      preference={preference}
      onPreferenceChange={update}
      monitor={undefined}
    />
  );
}

function openIso(fake: FakeMotionTimer, withModels = false): void {
  localStorage.setItem(TEAM_ROOM_STORAGE_KEY, JSON.stringify({ isCollapsed: false }));
  const state = buildRunModelTeams({
    teams: [
      buildTeamState('nina'),
      buildTeamState('lucas'),
      buildTeamState('olivia', { team: buildTeamView('olivia', { isEnabled: false }), recent: [] }),
    ],
  });
  renderApp({
    path: '/',
    isAuthenticated: true,
    routes: [
      ...(withModels ? modelTeamsRoutes(createModelTeamsHarness(state), LIVE_RUN_ID) : []),
      ...roomRoutes(createRoomHarness()),
    ],
    probe: (
      <MotionClockProvider timer={fake.timer}>
        <Room />
      </MotionClockProvider>
    ),
  });
}

async function isoStage(): Promise<HTMLElement> {
  await waitFor(() => expect(document.querySelector('[data-iso-office]')).not.toBeNull());
  return document.querySelector<HTMLElement>('[data-iso-office]') ?? document.body;
}

function cellOf(walker: Element): { x: number; y: number } {
  const classes = walker.className;
  return {
    x: Number(/\bx(\d+)\b/.exec(classes)?.[1]),
    y: Number(/\by(\d+)\b/.exec(classes)?.[1]),
  };
}

describe('escritório isométrico: cenário fixo, mesas e computadores', () => {
  test('is decorative, has the window, the quote board, the clock, plants and a computer screen per desk', async () => {
    openIso(createFakeMotionTimer());
    const stage = await isoStage();
    expect(stage.getAttribute('aria-hidden')).toBe('true');
    expect(
      stage.querySelectorAll('a[href], button, input, select, textarea, [tabindex]'),
    ).toHaveLength(0);
    expect(stage.querySelectorAll('[data-tower]')).toHaveLength(6);
    expect(stage.querySelector('polyline')).not.toBeNull();
    for (const slot of ['tiago', 'renata', 'vitor', 'sofia', 'alice', 'otavio']) {
      expect(stage.querySelector(`[data-desk="${slot}"]`)).not.toBeNull();
    }
    expect(stage.querySelectorAll('svg[data-chart]')).toHaveLength(
      stage.querySelectorAll('[data-desk]').length,
    );
    expect(stage.querySelector('circle')).not.toBeNull();
  });

  test('the six rule agents always show name and role, with the badge list below carrying the detail', async () => {
    openIso(createFakeMotionTimer());
    const stage = await isoStage();
    const text = stage.textContent ?? '';
    for (const word of [
      'Tiago',
      'Tendência',
      'Renata',
      'Reversão',
      'Vitor',
      'Volume',
      'Sofia',
      'Sentimento',
      'Alice',
      'Resumo do placar',
      'Otávio',
      'Auditor',
    ]) {
      expect(text).toContain(word);
    }
    expect(await screen.findByRole('region', { name: 'Crachás da equipe' })).toBeDefined();
  });

  test('only the enabled model teams get a desk', async () => {
    openIso(createFakeMotionTimer(), true);
    const stage = await isoStage();
    await waitFor(() => expect(stage.querySelectorAll('[data-desk]')).toHaveLength(8));
    expect(stage.querySelector('[data-desk="nina"]')).not.toBeNull();
    expect(stage.querySelector('[data-desk="lucas"]')).not.toBeNull();
    expect(stage.querySelector('[data-desk="olivia"]')).toBeNull();
    expect(stage.textContent).not.toContain('Olívia');
  });
});

describe('escritório isométrico: a equipe anda', () => {
  test('somebody walks, never over furniture or a desk, and everybody ends in the own seat', async () => {
    const fake = createFakeMotionTimer();
    openIso(fake);
    const stage = await isoStage();
    expect(stage.getAttribute('data-moving')).toBe('on');
    let sawWalking = false;
    let awayAtOnce = 0;
    for (let elapsed = 0; elapsed < 90_000; elapsed += 250) {
      act(() => fake.advance(250));
      const walkers = [...stage.querySelectorAll('[data-slot]')];
      const away = walkers.filter((walker) => {
        const spec = OFFICE_DESKS.find((item) => item.slot === walker.getAttribute('data-slot'));
        const cell = cellOf(walker);
        expect(FURNITURE.has(keyOf(cell))).toBe(false);
        return spec !== undefined && keyOf(spec.seat) !== keyOf(cell);
      });
      sawWalking ||= stage.querySelector('[data-pose="walk"]') !== null;
      awayAtOnce = Math.max(awayAtOnce, away.length);
    }
    expect(sawWalking).toBe(true);
    expect(awayAtOnce).toBeLessThanOrEqual(1);
    expect(fake.pending()).toBe(1);
  });

  test('the calm choice makes the step slower', async () => {
    localStorage.setItem('ativada.team-room.calm', 'true');
    const fake = createFakeMotionTimer();
    openIso(fake);
    const stage = await isoStage();
    expect(stage.getAttribute('data-rhythm')).toBe('calm');
  });

  test('prefers-reduced-motion keeps the fixed poses: nobody walks, nothing is scheduled', async () => {
    const original = globalThis.matchMedia;
    globalThis.matchMedia = (): MediaQueryList => ({ matches: true }) as MediaQueryList;
    try {
      const fake = createFakeMotionTimer();
      openIso(fake);
      const stage = await isoStage();
      act(() => fake.advance(120_000));
      expect(stage.querySelector('[data-moving]')).toBeNull();
      expect(stage.querySelector('[data-pose]')).toBeNull();
      expect(stage.querySelector('[data-rhythm]')).toBeNull();
      expect(fake.pending()).toBe(0);
      const seated = [...stage.querySelectorAll('[data-slot]')].every((walker) => {
        const spec = OFFICE_DESKS.find((item) => item.slot === walker.getAttribute('data-slot'));
        return spec !== undefined && keyOf(spec.seat) === keyOf(cellOf(walker));
      });
      expect(seated).toBe(true);
    } finally {
      globalThis.matchMedia = original;
    }
  });
});

describe('escritório isométrico: escolha do cenário', () => {
  test('walking is the default and the front view stays one click away, remembered', async () => {
    openIso(createFakeMotionTimer());
    await isoStage();
    expect(document.querySelector('[data-light]')).toBeNull();
    const front = screen.getByRole('button', { name: 'Frontal' });
    expect(front.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(front);
    await waitFor(() => expect(document.querySelector('[data-light]')).not.toBeNull());
    expect(document.querySelector('[data-iso-office]')).toBeNull();
    expect(localStorage.getItem(TEAM_ROOM_STORAGE_KEY)).toContain('"officeView":"front"');
  });
});

describe('escritório isométrico: folha de estilo', () => {
  const read = (name: string): string =>
    readFileSync(new URL(`../src/runs/team-room/office/${name}`, import.meta.url), 'utf8');

  test('the step duration in the stylesheet mirrors the rhythm', () => {
    const css = read('IsoOffice.module.css');
    expect(css).toMatch(
      new RegExp(`data-rhythm='lively'\\][^}]*--step: ${RHYTHM.lively.stepMilliseconds}ms`),
    );
    expect(css).toMatch(
      new RegExp(`data-rhythm='calm'\\][^}]*--step: ${RHYTHM.calm.stepMilliseconds}ms`),
    );
  });

  test('the only transition is on transform, under no-preference, and reduced motion removes it', () => {
    const css = read('IsoWalker.module.css');
    const transitions = [...css.matchAll(/transition:\s*([^;]+);/g)].map((match) => match[1]);
    expect(transitions).toContain('transform var(--step) linear');
    expect(
      transitions.filter((value) => value !== 'none' && !value?.startsWith('transform')),
    ).toEqual([]);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transition: none/);
    expect(css).not.toMatch(/animation:/);
  });
});
