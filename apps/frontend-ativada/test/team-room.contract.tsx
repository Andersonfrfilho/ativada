// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { afterEach, describe, expect, test } from 'bun:test';

import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { useLiveStream } from '../src/live/useLiveStream.hook.js';
import { CompactTeam } from '../src/runs/team-room/CompactTeam.component.js';
import { TeamRoomSection } from '../src/runs/team-room/TeamRoomSection.component.js';
import { TEAM_ROOM_STORAGE_KEY } from '../src/runs/team-room/team-room.constant.js';
import { useTeamRoomPreference } from '../src/runs/team-room/useTeamRoomPreference.hook.js';
import { buildProjectionsSummary } from './support/candle-chart-fixtures.js';
import { LIVE_RUN_ID, type LiveHarness } from './support/live-tracking-harness.js';
import { findLoadedTeam } from './support/loaded-team.js';
import { renderApp, type RenderedApp } from './support/render-app.js';
import {
  buildRoomDecision,
  buildRoomLiveStatus,
  createRoomHarness,
  DEFAULT_VOTES,
  roomRoutes,
  SERVER_MOTIVE,
} from './support/team-room-fixtures.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function noop(): void {
  return;
}

function Room({ monitor }: { readonly monitor?: ReactElement | undefined }): ReactElement {
  const { preference, update } = useTeamRoomPreference();
  useLiveStream(noop, noop);
  return (
    <TeamRoomSection
      runId={LIVE_RUN_ID}
      preference={preference}
      onPreferenceChange={update}
      monitor={monitor}
    />
  );
}

function open(
  harness: LiveHarness,
  summary: Record<string, unknown> = buildProjectionsSummary(),
  monitor?: ReactElement,
): RenderedApp {
  return renderApp({
    path: '/',
    isAuthenticated: true,
    routes: roomRoutes(harness, summary),
    probe: <Room monitor={monitor} />,
  });
}

async function stageOf(): Promise<HTMLElement> {
  await waitFor(() => expect(document.querySelector('[data-motion]')).not.toBeNull());
  return document.querySelector<HTMLElement>('[data-motion]') ?? document.body;
}

describe('sala da equipe: vela nova (cena do preview)', () => {
  test('each family speaks with its rules, the server sentence and the vote in words', async () => {
    open(createRoomHarness());
    const stage = within(await stageOf());
    await stage.findByText(SERVER_MOTIVE);
    for (const name of ['Tendência', 'Reversão', 'Volume', 'Sentimento']) {
      expect(stage.getAllByText(name).length).toBeGreaterThan(0);
    }
    expect(stage.getAllByText('contra').length).toBeGreaterThan(0);
    expect(stage.getAllByText('a favor').length).toBeGreaterThan(0);
    expect(stage.getAllByText('sem leitura').length).toBe(1);
    expect(stage.getAllByText('Resumo do placar da estratégia').length).toBe(1);
    expect(stage.getByText('Esperou')).toBeDefined();
    expect(stage.getByText('pontuação +1 de +2')).toBeDefined();
    expect(stage.getByText('Faltou 1 ponto: o RSI (55) está entre 30 e 70.')).toBeDefined();
  });

  test('who voted gets "votou" and who is out of the scoreboard gets "fora do placar"', async () => {
    open(createRoomHarness());
    const stage = within(await stageOf());
    await stage.findAllByText('votou · peso 1');
    expect(stage.getAllByText('fora do placar')).toHaveLength(1);
    expect(stage.getAllByText('sem voto · peso 1').length).toBeGreaterThan(0);
  });

  test('the auditor reads the summary of hits against the coin flip', async () => {
    open(createRoomHarness());
    const stage = within(await stageOf());
    await stage.findByText('49,42% (171 de 346)');
    expect(stage.getByText('Igual à moeda ao ar')).toBeDefined();
    expect(stage.getByText('50,00%')).toBeDefined();
  });

  test('the stage is decorative: aria-hidden and nothing focusable inside', async () => {
    open(createRoomHarness());
    const stage = await stageOf();
    expect(stage.getAttribute('aria-hidden')).toBe('true');
    expect(
      stage.querySelectorAll('a[href], button, input, select, textarea, [tabindex]'),
    ).toHaveLength(0);
  });

  test('the text list has one line per character and repeats the same sentences', async () => {
    open(createRoomHarness());
    await stageOf();
    const details = (await screen.findByText('Falas desta vela em texto')).closest('details');
    const list = within(details ?? document.body).getAllByRole('listitem');
    expect(list).toHaveLength(6);
    expect(within(details ?? document.body).getByText(new RegExp(SERVER_MOTIVE))).toBeDefined();
    expect(list.at(-1)?.textContent).toContain('Acertou o lado 49,42% (171 de 346)');
  });

  test('nothing in the card sounds like a promise or a recommendation', async () => {
    open(createRoomHarness());
    const stage = await stageOf();
    await within(stage).findByText('49,42% (171 de 346)');
    const region = await screen.findByRole('region', { name: 'Sala da equipe' });
    expect(region.textContent).not.toMatch(
      /vai subir|vai cair|garantid|recomendamos|compre\b|confiante/i,
    );
    expect(region.textContent).toContain('Tendência, não promessa');
  });
});

describe('sala da equipe: equipe sem opinião, auditor com poucas previsões e sem simulação', () => {
  test('with every rule neutral the team has no opinion and says so', async () => {
    const neutral = DEFAULT_VOTES.map((vote) => ({ ...vote, vote: 0 as const }));
    const harness = createRoomHarness([buildRoomDecision({ votes: neutral })]);
    harness.liveStatus = buildRoomLiveStatus([buildRoomDecision({ votes: neutral })], neutral);
    open(harness);
    const stage = within(await stageOf());
    await stage.findByText(/A equipe não tem opinião nesta vela/);
    expect(stage.queryAllByText(/^votou/)).toHaveLength(0);
  });

  test('with fewer than 30 predictions the auditor shows the count and no rate', async () => {
    open(
      createRoomHarness(),
      buildProjectionsSummary({ counted: 12, hits: 7, verdict: 'too_few', wilson: null }),
    );
    const stage = within(await stageOf());
    await stage.findByText('— (12 contadas)');
    expect(stage.getByText('Poucas previsões')).toBeDefined();
  });

  test('without a running simulation the room shows the last candle and the plain sentence', async () => {
    const harness = createRoomHarness();
    harness.liveStatus = buildRoomLiveStatus([buildRoomDecision()], DEFAULT_VOTES, {
      status: 'completed',
    });
    open(harness);
    await screen.findByText(/Sem simulação rodando agora/);
    await stageOf();
  });

  test('before the first candle the card repeats the server sentence', async () => {
    const harness = createRoomHarness([]);
    harness.liveStatus = {
      ...buildRoomLiveStatus([]),
      triggers: {
        status: 'unavailable',
        reason: 'no_candle',
        message: 'Aguardando a primeira vela fechar.',
      },
    };
    open(harness);
    expect(await screen.findByText('Aguardando a primeira vela fechar.')).toBeDefined();
    expect(document.querySelector('[data-motion]')).toBeNull();
  });
});

describe('sala da equipe: movimento só na vela nova', () => {
  const NEW_CANDLE = {
    type: 'event',
    runId: LIVE_RUN_ID,
    kind: 'fill',
    eventId: 'e1',
    at: 1,
  } as const;

  function arriveNewCandle(harness: LiveHarness, app: RenderedApp): void {
    harness.liveStatus = buildRoomLiveStatus([
      buildRoomDecision({ hoursBefore: -1, message: 'Vela nova decidida.' }),
      buildRoomDecision(),
    ]);
    act(() => app.stream.emit(NEW_CANDLE));
  }

  test('opening the screen does not animate; a new candle thinks, speaks and announces once', async () => {
    const harness = createRoomHarness();
    const app = open(harness);
    const stage = await stageOf();
    await within(stage).findByText(SERVER_MOTIVE);
    expect(stage.getAttribute('data-motion')).toBe('off');
    expect(stage.querySelector('[data-state="thinking"]')).toBeNull();
    arriveNewCandle(harness, app);
    await waitFor(() => expect(stage.querySelector('[data-state="thinking"]')).not.toBeNull());
    expect(document.querySelector('p[aria-live="polite"]')?.textContent).toBe('');
    await waitFor(() => expect(stage.getAttribute('data-motion')).toBe('off'), { timeout: 4000 });
    await waitFor(() =>
      expect(document.querySelector('p[aria-live="polite"]')?.textContent).toMatch(
        /^Vela que fechou .+As falas estão na lista de texto\.$/,
      ),
    );
  });

  test('with the animation turned off the new candle goes straight to the final state', async () => {
    localStorage.setItem(TEAM_ROOM_STORAGE_KEY, JSON.stringify({ isAnimationOn: false }));
    const harness = createRoomHarness();
    const app = open(harness);
    const stage = await stageOf();
    await within(stage).findByText(SERVER_MOTIVE);
    arriveNewCandle(harness, app);
    await within(stage).findByText('Vela nova decidida.');
    expect(stage.getAttribute('data-motion')).toBe('off');
    expect(stage.querySelector('[data-state="thinking"]')).toBeNull();
    await waitFor(() =>
      expect(document.querySelector('p[aria-live="polite"]')?.textContent).toMatch(
        /^Vela que fechou/,
      ),
    );
  });

  test('with prefers-reduced-motion the new candle shows the final state in the first frame', async () => {
    const original = globalThis.matchMedia;
    globalThis.matchMedia = (): MediaQueryList => ({ matches: true }) as MediaQueryList;
    try {
      const harness = createRoomHarness();
      const app = open(harness);
      const stage = await stageOf();
      await within(stage).findByText(SERVER_MOTIVE);
      arriveNewCandle(harness, app);
      await within(stage).findByText('Vela nova decidida.');
      expect(stage.querySelector('[data-state="thinking"]')).toBeNull();
      expect(stage.getAttribute('data-motion')).toBe('off');
    } finally {
      globalThis.matchMedia = original;
    }
  });
});

describe('sala da equipe: rever velas, recolher e escolher o layout', () => {
  test('previous candle shows the old state without animation and "Voltar para agora" undoes it', async () => {
    const older = buildRoomDecision({ hoursBefore: 1, message: 'Vela de antes.' });
    open(createRoomHarness([buildRoomDecision(), older]));
    const stage = await stageOf();
    await within(stage).findByText(SERVER_MOTIVE);
    fireEvent.click(screen.getByRole('button', { name: '← Vela anterior' }));
    await screen.findByText(/Revendo a vela que fechou/);
    expect(within(stage).getByText('Vela de antes.')).toBeDefined();
    expect(stage.getAttribute('data-motion')).toBe('off');
    expect(within(stage).queryByText(SERVER_MOTIVE)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para agora' }));
    await within(stage).findByText(SERVER_MOTIVE);
  });

  test('hiding the room is remembered and the monitor with the chart stays on the screen', async () => {
    open(createRoomHarness(), buildProjectionsSummary(), <p>O gráfico aqui</p>);
    await stageOf();
    expect(screen.getByText('O gráfico aqui')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Esconder a sala' }));
    expect(document.querySelector('[data-motion]')).toBeNull();
    expect(screen.getByText('O gráfico aqui')).toBeDefined();
    expect(JSON.parse(localStorage.getItem(TEAM_ROOM_STORAGE_KEY) ?? '{}')).toMatchObject({
      isCollapsed: true,
    });
    expect(screen.getByRole('button', { name: 'Mostrar a sala' })).toBeDefined();
  });

  test('the layout switch offers both modes and remembers the choice', async () => {
    open(createRoomHarness());
    await stageOf();
    const group = screen.getByRole('group', { name: 'Como mostrar a equipe' });
    const chartAndTeam = within(group).getByRole('button', { name: 'Gráfico + equipe' });
    const roomWithChart = within(group).getByRole('button', { name: 'Sala com o gráfico' });
    expect(chartAndTeam.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(roomWithChart);
    expect(roomWithChart.getAttribute('aria-pressed')).toBe('true');
    expect(JSON.parse(localStorage.getItem(TEAM_ROOM_STORAGE_KEY) ?? '{}')).toMatchObject({
      layout: 'room_with_chart',
    });
  });
});

describe('equipe compacta ao lado de "Próxima vela de perto"', () => {
  test('lists the votes of the latest candle in words, with the summary of the scoreboard', async () => {
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: roomRoutes(createRoomHarness()),
      probe: <CompactTeam runId={LIVE_RUN_ID} />,
    });
    const aside = await findLoadedTeam();
    expect(within(aside).getByText('RSI: contra')).toBeDefined();
    expect(within(aside).getByText('Cruzamento de médias: a favor')).toBeDefined();
    expect(within(aside).getByText('pontuação +1 de +2')).toBeDefined();
  });
});
