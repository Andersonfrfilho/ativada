// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { afterEach, describe, expect, test } from 'bun:test';

import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { useLiveStream } from '../src/live/useLiveStream.hook.js';
import { decisionSchema } from '../src/runs/live-tracking/live-status.validation.js';
import { CompactTeam } from '../src/runs/team-room/CompactTeam.component.js';
import { pickDecisionForCandle } from '../src/runs/team-room/compact-team-pick.js';
import { TEAM_ROOM_STORAGE_KEY } from '../src/runs/team-room/team-room.constant.js';
import { useTeamRoomPreference } from '../src/runs/team-room/useTeamRoomPreference.hook.js';

import { showCandleCard } from './support/candle-card-harness.js';
import {
  buildDecisionAt,
  HOUR,
  LIVE_RUN_ID,
  openLiveDetail,
  type LiveHarness,
} from './support/live-tracking-harness.js';
import { findLoadedTeam } from './support/loaded-team.js';
import { renderApp, type RenderedApp } from './support/render-app.js';
import {
  buildRoomDecision,
  buildRoomLiveStatus,
  createRoomHarness,
  FIXTURE_CANDLE_TIME,
  roomRoutes,
  SERVER_MOTIVE,
} from './support/team-room-fixtures.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function isBefore(first: HTMLElement, second: HTMLElement): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe('detalhe da simulação ao vivo: a equipe junto do gráfico', () => {
  test('the page opens on the chart with the team on the balcony, then the short summary, decisions, detail and only then the big room', async () => {
    openLiveDetail(createRoomHarness());
    const summary = await screen.findByRole('region', { name: 'Sua simulação ao vivo' });
    const chart = await screen.findByRole('region', { name: 'Preço e operações' });
    const decisions = await screen.findByRole('region', { name: /^O que a estratégia decidiu/ });
    const tracking = await screen.findByRole('region', { name: 'Acompanhamento' });
    const room = await screen.findByRole('region', { name: 'Sala da equipe' });
    const order = [chart, summary, decisions, tracking, room];
    order.slice(1).forEach((section, index) => {
      expect(isBefore(order[index] ?? section, section)).toBe(true);
    });
  });

  test('the short summary shows balance, result and buy and hold in words, with the server numbers', async () => {
    openLiveDetail(createRoomHarness());
    const summary = await screen.findByRole('region', { name: 'Sua simulação ao vivo' });
    expect(summary.textContent).toContain('Saldo');
    expect(summary.textContent).toContain('Resultado');
    expect(summary.textContent).toContain('Comprar e segurar');
    expect(summary.textContent).toContain('1.030,50 USDT');
    expect(summary.textContent).toContain('acima do início');
  });
});

describe('a vela apontada no gráfico chega à equipe', () => {
  async function openLiveChart(): Promise<HTMLElement> {
    showCandleCard({
      kind: 'live_paper',
      aside: (pointed) => <p data-testid="pointed">{String(pointed)}</p>,
    });
    return screen.findByRole('img', { name: 'Gráfico de velas de BNB/USDT' });
  }

  test('the keyboard cross tells the team which candle it points at, and Esc goes back to now', async () => {
    const chart = await openLiveChart();
    const probe = await screen.findByTestId('pointed');
    expect(probe.textContent).toBe('undefined');
    fireEvent.keyDown(chart, { key: 'ArrowLeft' });
    await waitFor(() => expect(Number(probe.textContent)).toBeGreaterThan(0));
    fireEvent.keyDown(chart, { key: 'Escape' });
    await waitFor(() => expect(probe.textContent).toBe('undefined'));
  });
});

const NEW_CANDLE_EVENT = {
  type: 'event',
  runId: LIVE_RUN_ID,
  kind: 'fill',
  eventId: 'e1',
  at: 1,
} as const;

function noop(): void {
  return;
}

function Team({ pointed }: { readonly pointed?: number | undefined }): ReactElement {
  useLiveStream(noop, noop);
  return <CompactTeam runId={LIVE_RUN_ID} pointedOpenTime={pointed} />;
}

function openTeam(harness: LiveHarness, pointed?: number): RenderedApp {
  return renderApp({
    path: '/',
    isAuthenticated: true,
    routes: roomRoutes(harness),
    probe: <Team pointed={pointed} />,
  });
}

describe('pickDecisionForCandle', () => {
  const latest = buildDecisionAt(0);
  const older = buildDecisionAt(1);
  const decisions = [latest, older].map((raw) => decisionSchema.parse(raw));

  test('without a pointed candle the latest decision speaks', () => {
    expect(pickDecisionForCandle(decisions, undefined)).toBe(decisions[0]);
  });

  test('the same opening, or a bigger candle that covers the instant, finds its decision', () => {
    const olderDecision = decisions[1];
    expect(pickDecisionForCandle(decisions, olderDecision?.candleTime)).toBe(olderDecision);
    expect(pickDecisionForCandle(decisions, (olderDecision?.candleTime ?? 0) + HOUR / 2)).toBe(
      olderDecision,
    );
    expect(pickDecisionForCandle(decisions, FIXTURE_CANDLE_TIME - 50 * HOUR)).toBeUndefined();
  });
});

describe('equipe junto do gráfico: o que cada agente disse naquela vela', () => {
  const older = buildRoomDecision({ hoursBefore: 1, message: 'Vela de antes.' });

  test('pointing at an older candle shows what was recorded for it, without the live sentences', async () => {
    openTeam(createRoomHarness([buildRoomDecision(), older]), FIXTURE_CANDLE_TIME - HOUR);
    const aside = await findLoadedTeam();
    expect(await within(aside).findByText('Vela de antes.')).toBeDefined();
    expect(within(aside).queryByText(SERVER_MOTIVE)).toBeNull();
    expect(aside.textContent).toContain('Vela apontada no gráfico');
  });

  test('a candle with no recorded speech says so instead of showing another candle', async () => {
    openTeam(createRoomHarness([buildRoomDecision(), older]), FIXTURE_CANDLE_TIME - 50 * HOUR);
    const aside = await findLoadedTeam();
    expect(aside.textContent).toContain('Esta vela não tem falas gravadas');
    expect(aside.querySelector('[data-motion]')).toBeNull();
  });

  test('a new candle thinks, speaks and rests', async () => {
    const harness = createRoomHarness();
    const app = openTeam(harness);
    const aside = await findLoadedTeam();
    await within(aside).findByText(SERVER_MOTIVE);
    expect(aside.querySelector('[data-motion]')?.getAttribute('data-motion')).toBe('off');
    harness.liveStatus = buildRoomLiveStatus([
      buildRoomDecision({ hoursBefore: -1, message: 'Vela nova decidida.' }),
      buildRoomDecision(),
    ]);
    act(() => app.stream.emit(NEW_CANDLE_EVENT));
    await waitFor(() => expect(aside.querySelector('[data-state="thinking"]') !== null).toBe(true));
    await waitFor(
      () => expect(aside.querySelector('[data-motion]')?.getAttribute('data-motion')).toBe('off'),
      { timeout: 4000 },
    );
    expect(aside.querySelector('[data-state="thinking"]')).toBeNull();
    expect(within(aside).getByText('Vela nova decidida.')).toBeDefined();
  });

  test('a refetch with the same latest candle (price moving) does not animate again', async () => {
    const harness = createRoomHarness();
    const app = openTeam(harness);
    const aside = await findLoadedTeam();
    await within(aside).findByText(SERVER_MOTIVE);
    act(() => app.stream.emit(NEW_CANDLE_EVENT));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(aside.querySelector('[data-state="thinking"]')).toBeNull();
    expect(aside.querySelector('[data-motion]')?.getAttribute('data-motion')).toBe('off');
  });

  test('with the animation turned off the new candle goes straight to the final state', async () => {
    localStorage.setItem(TEAM_ROOM_STORAGE_KEY, JSON.stringify({ isAnimationOn: false }));
    const harness = createRoomHarness();
    const app = renderApp({
      path: '/',
      isAuthenticated: true,
      routes: roomRoutes(harness),
      probe: <TeamWithPreference />,
    });
    const aside = await findLoadedTeam();
    await within(aside).findByText(SERVER_MOTIVE);
    harness.liveStatus = buildRoomLiveStatus([
      buildRoomDecision({ hoursBefore: -1, message: 'Vela nova decidida.' }),
      buildRoomDecision(),
    ]);
    act(() => app.stream.emit(NEW_CANDLE_EVENT));
    await within(aside).findByText('Vela nova decidida.');
    expect(aside.querySelector('[data-state="thinking"]')).toBeNull();
  });
});

function TeamWithPreference(): ReactElement {
  const { preference } = useTeamRoomPreference();
  useLiveStream(noop, noop);
  return <CompactTeam runId={LIVE_RUN_ID} isAnimationOn={preference.isAnimationOn} />;
}
