// Copyright (c) 2026 Ada Technology. All rights reserved.
import { act, cleanup, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'bun:test';

import { LiveMarketProvider } from '../src/live/LiveMarketProvider.component.js';
import { TeamBalcony } from '../src/runs/team-room/balcony/TeamBalcony.component.js';
import { CALM_STORAGE_KEY } from '../src/runs/team-room/motion/calm-store.js';
import { MotionClockProvider } from '../src/runs/team-room/motion/MotionClock.context.js';
import { RHYTHM } from '../src/runs/team-room/motion/motion-rhythm.js';
import { LIVE_RUN_ID } from './support/live-tracking-harness.js';
import { createFakeMotionTimer, type FakeMotionTimer } from './support/fake-motion-timer.js';
import { findLoadedTeam } from './support/loaded-team.js';
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

async function openBalcony(fake: FakeMotionTimer): Promise<HTMLElement> {
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
      ...modelTeamsRoutes(createModelTeamsHarness(state), LIVE_RUN_ID),
      ...roomRoutes(createRoomHarness()),
    ],
    probe: (
      <MotionClockProvider timer={fake.timer}>
        <LiveMarketProvider>
          <TeamBalcony runId={LIVE_RUN_ID} />
        </LiveMarketProvider>
      </MotionClockProvider>
    ),
  });
  return findLoadedTeam();
}

function speakers(team: HTMLElement): readonly string[] {
  return [...team.querySelectorAll('li[data-speaking="true"]')].map(
    (item) => item.getAttribute('data-slot') ?? '',
  );
}

function tick(fake: FakeMotionTimer, milliseconds: number): void {
  act(() => fake.advance(milliseconds));
}

describe('varanda viva: nomes, cargos e quem aparece', () => {
  test('the six rule agents keep name and role visible, and only the enabled model teams show up', async () => {
    const team = await openBalcony(createFakeMotionTimer());
    const text = team.textContent ?? '';
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
      'Risco sênior',
      'Otávio',
      'Auditor',
    ]) {
      expect(text).toContain(word);
    }
    const slots = [...team.querySelectorAll('li[data-slot]')].map((item) =>
      item.getAttribute('data-slot'),
    );
    expect(slots).toEqual([
      'tiago',
      'renata',
      'alice',
      'vitor',
      'sofia',
      'otavio',
      'nina',
      'lucas',
    ]);
  });
});

describe('varanda viva: balões em turnos com um relógio único', () => {
  test('only one agent speaks at a time, everybody speaks once a round and the text stays in the page', async () => {
    const fake = createFakeMotionTimer();
    const team = await openBalcony(fake);
    expect(team.querySelector('[data-turns="on"]')).not.toBeNull();
    const heard = new Set<string>();
    for (let elapsed = 0; elapsed < 8 * RHYTHM.lively.turnMilliseconds; elapsed += 200) {
      tick(fake, 200);
      const now = speakers(team);
      expect(now.length).toBeLessThanOrEqual(1);
      now.forEach((slot) => heard.add(slot));
    }
    expect([...heard].sort()).toEqual(
      ['alice', 'lucas', 'nina', 'otavio', 'renata', 'sofia', 'tiago', 'vitor'].sort(),
    );
    expect(within(team).getAllByText('não vota').length).toBeGreaterThan(0);
    expect(fake.pending()).toBe(1);
  });

  test('the state stays fixed on the badge (icon + word) while a balloon is closed', async () => {
    const team = await openBalcony(createFakeMotionTimer());
    const badges = team.querySelectorAll('button[data-team], li[data-slot] button');
    expect(badges.length).toBeGreaterThanOrEqual(8);
    expect(within(team).getAllByText(/Decide|Mede|Sem medida/).length).toBeGreaterThan(0);
  });

  test('the calm choice slows the rhythm: the second speaker takes twice as long', async () => {
    localStorage.setItem(CALM_STORAGE_KEY, 'true');
    const fake = createFakeMotionTimer();
    const team = await openBalcony(fake);
    tick(fake, RHYTHM.lively.turnMilliseconds + 100);
    const afterLively = speakers(team);
    tick(fake, RHYTHM.calm.turnMilliseconds);
    expect(afterLively.length).toBe(1);
    expect(speakers(team).length).toBe(1);
  });
});

describe('varanda viva: movimento reduzido', () => {
  test('prefers-reduced-motion draws no motion attribute and schedules nothing', async () => {
    const original = globalThis.matchMedia;
    globalThis.matchMedia = (): MediaQueryList => ({ matches: true }) as MediaQueryList;
    try {
      const fake = createFakeMotionTimer();
      const team = await openBalcony(fake);
      tick(fake, 60_000);
      expect(team.querySelector('[data-turns]')).toBeNull();
      expect(team.querySelector('[data-speaking]')).toBeNull();
      expect(team.querySelector('[data-gesture]')).toBeNull();
      expect(fake.pending()).toBe(0);
    } finally {
      globalThis.matchMedia = original;
    }
  });
});
