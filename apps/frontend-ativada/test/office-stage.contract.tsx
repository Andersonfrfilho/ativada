// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { afterEach, describe, expect, test } from 'bun:test';

import { act, cleanup, screen, waitFor, within } from '@testing-library/react';

import { useLiveStream } from '../src/live/useLiveStream.hook.js';
import { OFFICE_LIMITS } from '../src/runs/team-room/office/office.constant.js';
import { buildBoard, buildClock, buildScreen } from '../src/runs/team-room/office/office-model.js';
import { buildMonitor } from '../src/runs/team-room/office/office-monitors.js';
import { liveStatusSchema } from '../src/runs/live-tracking/live-status.validation.js';
import { TeamRoomSection } from '../src/runs/team-room/TeamRoomSection.component.js';
import { TEAM_ROOM_STORAGE_KEY } from '../src/runs/team-room/team-room.constant.js';
import type { SpecialistView } from '../src/runs/team-room/team-room.types.js';
import { useTeamRoomPreference } from '../src/runs/team-room/useTeamRoomPreference.hook.js';
import { LIVE_RUN_ID, type LiveHarness } from './support/live-tracking-harness.js';
import { renderApp, type RenderedApp } from './support/render-app.js';
import {
  buildRoomDecision,
  buildRoomLiveStatus,
  createRoomHarness,
  roomRoutes,
  type VoteSpec,
} from './support/team-room-fixtures.js';

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

function openOffice(harness: LiveHarness): RenderedApp {
  localStorage.setItem(
    TEAM_ROOM_STORAGE_KEY,
    JSON.stringify({ isCollapsed: false, officeView: 'front' }),
  );
  return renderApp({
    path: '/',
    isAuthenticated: true,
    routes: roomRoutes(harness),
    probe: <Room />,
  });
}

async function stageOf(): Promise<HTMLElement> {
  await waitFor(() => expect(document.querySelector('[data-light]')).not.toBeNull());
  return document.querySelector<HTMLElement>('[data-light]') ?? document.body;
}

const READING_VOTES: readonly VoteSpec[] = [
  {
    ruleId: 'ema',
    label: 'EMA 9×21',
    kind: 'ema_cross',
    vote: 1,
    reading: { fast: '12.928', slow: '12.948' },
  },
  { ruleId: 'rsi', label: 'RSI 14', kind: 'rsi', vote: 0, reading: { value: '34.6' } },
  {
    ruleId: 'boll',
    label: 'Bollinger 20',
    kind: 'bollinger',
    vote: -1,
    reading: { lower: '12.862', middle: '12.9', upper: '12.95' },
  },
  { ruleId: 'obv', label: 'OBV', kind: 'obv_trend', vote: 0, reading: { obv: '100', ema: '90' } },
  { ruleId: 'fg', label: 'Medo e Ganância', kind: 'fear_greed', vote: 0, reading: { value: '41' } },
];

function harnessWith(votes: readonly VoteSpec[]): LiveHarness {
  const decision = buildRoomDecision({ votes });
  const harness = createRoomHarness([decision]);
  harness.liveStatus = buildRoomLiveStatus([decision], votes);
  return harness;
}

function monitorTexts(stage: HTMLElement): string[] {
  return [...stage.querySelectorAll('svg[viewBox="0 0 160 96"] text')].map(
    (node) => node.textContent ?? '',
  );
}

describe('escritório: os monitores mostram só o que o servidor gravou na vela', () => {
  test('each desk monitor draws its specialist readings: EMA, RSI and bands, OBV, Medo e Ganância', async () => {
    openOffice(harnessWith(READING_VOTES));
    const stage = await stageOf();
    await waitFor(() => expect(monitorTexts(stage).join('|')).toContain('12,928'));
    const texts = monitorTexts(stage).join('|');
    for (const expected of [
      'média rápida 12,928',
      'média lenta 12,948',
      'RSI 34,6',
      'banda de baixo 12,862',
      'banda de cima 12,95',
      'OBV 100',
      'média OBV 90',
      '41',
    ]) {
      expect(texts).toContain(expected);
    }
  });

  test('a rule without a recorded reading draws no number at all', async () => {
    const votes: readonly VoteSpec[] = [
      { ruleId: 'rsi', label: 'RSI 14', kind: 'rsi', vote: 0, isMissing: true },
    ];
    openOffice(harnessWith(votes));
    const stage = await stageOf();
    await waitFor(() => expect(monitorTexts(stage)).toContain('sem leitura gravada'));
    expect(monitorTexts(stage).every((text) => !/[0-9]/.test(text))).toBe(true);
  });

  test('the monitor model keeps the known scale only for the gauges', () => {
    const rsi: SpecialistView = {
      family: 'reversion',
      name: 'Reversão',
      tone: 'normal',
      placard: 'peso 1',
      rules: [
        {
          ruleId: 'rsi',
          kind: 'rsi',
          label: 'RSI 14',
          voteKind: 'neutral',
          weightText: '1',
          isCounted: true,
          motive: undefined,
          reading: '34,6',
          values: { value: '34.6' },
        },
      ],
    };
    const monitor = buildMonitor('reversion', rsi);
    expect(monitor.kind).toBe('oscillator');
    expect(monitor.readouts[0]?.ratio).toBeCloseTo(0.346, 3);
    expect(buildMonitor('trend', undefined).kind).toBe('empty');
  });
});

describe('escritório: a planta e a lista equivalente', () => {
  test('the stage is decorative, has the wall, the models room and animates at most 60 elements', async () => {
    openOffice(harnessWith(READING_VOTES));
    const stage = await stageOf();
    expect(stage.getAttribute('aria-hidden')).toBe('true');
    expect(
      stage.querySelectorAll('a[href], button, input, select, textarea, [tabindex]'),
    ).toHaveLength(0);
    expect(stage.querySelectorAll('[data-animated]').length).toBeLessThanOrEqual(
      OFFICE_LIMITS.MAX_ANIMATED_ELEMENTS,
    );
    await waitFor(() => expect(stage.textContent).toContain('comprar'));
    const text = stage.textContent ?? '';
    for (const expected of [
      'Próximo fechamento',
      'Quadro de avisos',
      'Mesa da Alice',
      'Prancheta · Wilson 95%',
      'Café',
      'Sala das equipes de modelo',
      'Nina',
      'Lucas',
      'Olívia',
      'MODELO',
    ]) {
      expect(text).toContain(expected);
    }
    expect(text).not.toContain('em breve');
  });

  test('the badge list repeats the six people as 44 px buttons with the sheet', async () => {
    openOffice(harnessWith(READING_VOTES));
    await stageOf();
    const list = await screen.findByRole('region', { name: 'Crachás da equipe' });
    for (const name of ['Tiago', 'Renata', 'Alice', 'Vitor', 'Sofia', 'Otávio']) {
      expect(within(list).getByRole('button', { name: new RegExp(`^${name}, `) })).toBeDefined();
    }
  });

  test('the office opens collapsed by default, under "Ver o escritório"', async () => {
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: roomRoutes(createRoomHarness()),
      probe: <Room />,
    });
    expect(await screen.findByRole('button', { name: 'Ver o escritório' })).toBeDefined();
    expect(document.querySelector('[data-light]')).toBeNull();
  });
});

function statusWith(overrides: Record<string, unknown>): ReturnType<typeof liveStatusSchema.parse> {
  const base = buildRoomLiveStatus([buildRoomDecision(), buildRoomDecision({ hoursBefore: 1 })]);
  return liveStatusSchema.parse({ ...base, ...overrides });
}

describe('escritório: parede (relógio, telão, quadro)', () => {
  test('the clock shows the next closing in the user time zone, with the hands on it', () => {
    const closing = Date.UTC(2026, 9, 16, 3, 15);
    const base = statusWith({});
    const status = { ...base, run: { ...base.run, nextDecisionAt: closing } };
    const clock = buildClock(status, 'UTC');
    expect(clock.text).toBe('03:15');
    expect(clock.caption).toBe('vela de 1h');
    expect(clock.minuteAngle).toBe(90);
    expect(clock.hourAngle).toBe(97.5);
  });

  test('without a next closing the clock says so instead of inventing an hour', () => {
    const base = statusWith({});
    const clock = buildClock({ ...base, run: { ...base.run, nextDecisionAt: null } }, 'UTC');
    expect(clock.text).toBe('--:--');
  });

  test('the screen draws the closes the server sent and the open position levels inside the range', () => {
    const position = {
      entryPrice: '100',
      quantity: '1',
      targetPrice: '110',
      stopPrice: '95',
      openedCandleTime: 1,
    };
    const status = statusWith({ openPosition: position });
    const screenModel = buildScreen(status, ['96', '98', '101', '99']);
    expect(screenModel.points.split(' ')).toHaveLength(4);
    expect(screenModel.levels.map((level) => level.key)).toEqual(['entry', 'target', 'stop']);
    expect(screenModel.levels.every((level) => level.y !== undefined)).toBe(true);
    expect(buildScreen(statusWith({}), []).levels).toEqual([]);
  });

  test('the board counts the active locks out of the five', () => {
    const locks = [true, false, false, true, false].map((isActive) => ({
      isActive,
      isApplicable: true,
    }));
    const board = buildBoard({
      signalWord: 'Esperou',
      scoreText: '+1 de +2',
      locks,
      goal: undefined,
    });
    expect(board.signal).toBe('Esperou · pontuação +1 de +2');
    expect(board.locks).toEqual({ active: 2, total: 5, flags: [true, false, false, true, false] });
    expect(
      buildBoard({ signalWord: 'x', scoreText: 'y', locks: undefined, goal: undefined }).locks,
    ).toBeUndefined();
  });
});

describe('escritório: a cena de compra na vela nova', () => {
  test('a candle that bought runs the walk and the sign, ends in under 4 s and lights the room green', async () => {
    const harness = createRoomHarness();
    const app = openOffice(harness);
    const stage = await stageOf();
    expect(stage.dataset.light).not.toBe('buy');
    harness.liveStatus = buildRoomLiveStatus([
      buildRoomDecision({ hoursBefore: -1, outcome: 'bought', message: 'Comprou na vela nova.' }),
      buildRoomDecision(),
    ]);
    act(() =>
      app.stream.emit({ type: 'event', runId: LIVE_RUN_ID, kind: 'fill', eventId: 'e1', at: 1 }),
    );
    await waitFor(() => expect(stage.dataset.phases).toContain('sign'), { timeout: 4000 });
    expect(stage.dataset.phases).toContain('walk');
    expect(stage.dataset.motion).toBe('on');
    await waitFor(() => expect(stage.dataset.motion).toBe('off'), { timeout: 4000 });
    expect(stage.dataset.phases).toBe('');
    expect(stage.dataset.light).toBe('buy');
  });
});
