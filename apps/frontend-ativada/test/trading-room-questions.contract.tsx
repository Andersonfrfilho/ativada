// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { LiveMarketProvider } from '../src/live/LiveMarketProvider.component.js';
import { MotionClockProvider } from '../src/runs/team-room/motion/MotionClock.context.js';
import { STEP_MILLISECONDS } from '../src/runs/trading-room/office-life.js';
import { TradingRoom } from '../src/runs/trading-room/TradingRoom.component.js';
import { createFakeMotionTimer, type FakeMotionTimer } from './support/fake-motion-timer.js';
import { dataResponse, type FakeRoute, type RecordedCall } from './support/fake-fetch.js';
import { LIVE_BASE, LIVE_RUN_ID, liveRoutes } from './support/live-tracking-harness.js';
import { renderApp } from './support/render-app.js';
import { createRoomHarness } from './support/team-room-fixtures.js';
import { buildTradePlan } from './support/trade-plan-fixtures.js';

// "Pergunte à equipe": a caixa na sala, a resposta do servidor no balão grande e o histórico "Perguntas" em texto.

const ORIGINAL_MATCH_MEDIA = globalThis.matchMedia;

afterEach(() => {
  cleanup();
  localStorage.clear();
  globalThis.matchMedia = ORIGINAL_MATCH_MEDIA;
});

class FakeMediaQueryList extends EventTarget implements MediaQueryList {
  readonly matches: boolean;
  readonly media: string;
  onchange: ((this: MediaQueryList, event: MediaQueryListEvent) => unknown) | null = null;
  constructor(media: string, matches: boolean) {
    super();
    this.media = media;
    this.matches = matches;
  }
  addListener(): void {
    return;
  }
  removeListener(): void {
    return;
  }
}

// Piso à vista (760 px ou mais) e sem movimento reduzido: a cena anda.
function wideScreen(): void {
  globalThis.matchMedia = (query: string): MediaQueryList =>
    new FakeMediaQueryList(query, query.includes('min-width'));
}

const ANSWERS: Readonly<Record<string, { agent: string; answer: string }>> = {
  trend: {
    agent: 'tiago',
    answer: 'Em ETHUSDT, pela EMA 9×21, a tendência está de alta e a regra vota a favor da compra.',
  },
  sentiment: {
    agent: 'sofia',
    answer:
      'O Fear & Greed mais recente está em 62 de 100 (0 é medo extremo, 100 é ganância extrema).',
  },
  stretch: {
    agent: 'renata',
    answer:
      'Em ETHUSDT, pela RSI 14, o preço está esticado para cima, e a regra vota contra a compra.',
  },
};

function answerOf(call: RecordedCall): Response {
  const question = call.query.get('question') ?? 'trend';
  const reply = ANSWERS[question] ?? ANSWERS['trend'];
  return dataResponse({
    version: 'questions-1',
    runId: LIVE_RUN_ID,
    symbol: call.query.get('symbol') ?? 'BTCUSDT',
    question,
    agent: reply?.agent ?? 'tiago',
    answer: reply?.answer ?? '',
    basis: question === 'stretch' ? 'indicative' : 'exact',
    asOf: { candleTime: 1_767_225_600_000, closedAt: 1_767_229_200_000 },
    notice: 'Não é recomendação de compra ou venda.',
  });
}

function roomRoutes(asked: RecordedCall[]): readonly FakeRoute[] {
  return [
    ...liveRoutes(createRoomHarness()),
    {
      method: 'GET',
      path: `${LIVE_BASE}/trade-plan`,
      respond: (): Response => dataResponse(buildTradePlan()),
    },
    {
      method: 'GET',
      path: `${LIVE_BASE}/questions`,
      respond: (call): Response => {
        asked.push(call);
        return answerOf(call);
      },
    },
  ];
}

function openRoom(asked: RecordedCall[], clock?: FakeMotionTimer): void {
  const room = <TradingRoom runId={LIVE_RUN_ID} screen={null} />;
  renderApp({
    path: `/backtests/${LIVE_RUN_ID}`,
    isAuthenticated: true,
    routes: roomRoutes(asked),
    ...(clock === undefined
      ? {}
      : {
          probe: (
            <MemoryRouter>
              <LiveMarketProvider>
                <MotionClockProvider timer={clock.timer}>{room}</MotionClockProvider>
              </LiveMarketProvider>
            </MemoryRouter>
          ),
        }),
  });
}

async function askBox(): Promise<HTMLElement> {
  return screen.findByRole('region', { name: 'Pergunte à equipe' });
}

describe('a caixa "Pergunte à equipe"', () => {
  test('a moeda começa na da simulação; perguntar manda o par e a pergunta e a resposta entra em "Perguntas"', async () => {
    const asked: RecordedCall[] = [];
    openRoom(asked);
    const box = await askBox();
    const coin = within(box).getByLabelText('Moeda');
    expect((coin as HTMLSelectElement).value).toBe('BTCUSDT');
    fireEvent.change(coin, { target: { value: 'ETHUSDT' } });
    fireEvent.click(within(box).getByRole('button', { name: 'Como está a tendência?' }));
    const history = await screen.findByRole('region', { name: 'Perguntas' });
    await waitFor(() => expect(history.textContent).toContain(ANSWERS['trend']?.answer ?? '-'));
    expect(history.textContent).toContain('Tiago · ETH/USDT · Como está a tendência?');
    expect(asked[0]?.query.get('symbol')).toBe('ETHUSDT');
    expect(asked[0]?.query.get('question')).toBe('trend');
  });

  test('a resposta nova é anunciada pela única região viva da sala; o histórico guarda as 5 últimas', async () => {
    const asked: RecordedCall[] = [];
    openRoom(asked);
    const box = await askBox();
    const room = screen.getByRole('region', { name: 'Sala de operações' });
    fireEvent.click(within(box).getByRole('button', { name: 'O RSI está esticado?' }));
    await waitFor(() => expect(asked).toHaveLength(1));
    const live = room.querySelectorAll('[aria-live]');
    expect(live).toHaveLength(1);
    await waitFor(() =>
      expect(live[0]?.textContent).toBe(`Renata respondeu: ${ANSWERS['stretch']?.answer ?? '-'}`),
    );
    const history = screen.getByRole('region', { name: 'Perguntas' });
    expect(history.textContent).toContain('Leitura aproximada: muda com a próxima vela.');
    for (let index = 0; index < 5; index += 1) {
      await waitFor(() =>
        expect(within(box).getByRole('button', { name: 'Como está o sentimento?' })).toHaveProperty(
          'disabled',
          false,
        ),
      );
      fireEvent.click(within(box).getByRole('button', { name: 'Como está o sentimento?' }));
      await waitFor(() => expect(asked).toHaveLength(index + 2));
    }
    await waitFor(() => expect(within(history).getAllByRole('listitem')).toHaveLength(5));
    expect(history.textContent).not.toContain('Renata');
  });
});

describe('o balão grande', () => {
  test('quem responde vai à frente do telão e o balão do piso mostra a resposta do servidor', async () => {
    wideScreen();
    const clock = createFakeMotionTimer();
    const asked: RecordedCall[] = [];
    openRoom(asked, clock);
    const box = await askBox();
    fireEvent.click(within(box).getByRole('button', { name: 'Como está a tendência?' }));
    await screen.findByText(ANSWERS['trend']?.answer ?? '-', { selector: 'p' });
    const room = screen.getByRole('region', { name: 'Sala de operações' });
    const floor = room.querySelector('[aria-hidden="true"][data-motion]');
    expect(floor).not.toBeNull();
    let isShown = false;
    for (let step = 0; step < 200 && !isShown; step += 1) {
      act(() => clock.advance(STEP_MILLISECONDS));
      isShown = floor?.textContent?.includes(ANSWERS['trend']?.answer ?? '-') ?? false;
    }
    expect(isShown).toBe(true);
    expect(floor?.textContent).toContain('Como está a tendência?');
    expect(clock.pending()).toBe(1);
  });
});
