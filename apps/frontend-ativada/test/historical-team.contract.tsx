// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ReactElement } from 'react';

import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { RunTeamAside } from '../src/runs/team-room/RunTeamAside.component.js';
import { TeamAside } from '../src/runs/team-room/TeamAside.context.js';
import { windowAnchorFor } from '../src/runs/team-room/historical-team-window.js';
import {
  buildProjectionsResponse,
  buildProjectionsSummary,
} from './support/candle-chart-fixtures.js';
import {
  dataResponse,
  errorResponse,
  pageResponse,
  type RecordedCall,
} from './support/fake-fetch.js';
import { HOUR, LIVE_BASE, LIVE_RUN_ID } from './support/live-tracking-harness.js';
import { renderApp } from './support/render-app.js';
import { buildRoomDecision } from './support/team-room-fixtures.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const TEAM_NAME = { name: 'Equipe agora' } as const;
const FIRST_CANDLE = 1_767_225_600_000;
const NEWEST = 40;
const RULE_MOTIVE = 'RSI: precisa ficar abaixo de 30 para votar a favor de comprar.';

// Uma decisão por hora: a vela `index` abre em FIRST_CANDLE + index horas. Só a de índice 7 diz outra frase.
function decisionOf(index: number): Record<string, unknown> {
  const message = index === 7 ? 'Na vela 7 o RSI (22) votou a favor.' : 'Faltou 1 ponto.';
  return {
    ...buildRoomDecision({ message }),
    candleTime: FIRST_CANDLE + index * HOUR,
    closedAt: FIRST_CANDLE + (index + 1) * HOUR,
  };
}

type OpenOptions = {
  readonly kind?: string;
  readonly candles?: readonly number[];
  readonly isFailing?: boolean;
};

type Server = { readonly calls: RecordedCall[]; isFailing: boolean };

function decisionsResponse(call: RecordedCall): Response {
  const at = call.query.get('at');
  const limit = Number(call.query.get('limit'));
  const newest = at === null ? NEWEST : Math.min(indexAt(Number(at)), NEWEST);
  const items = Array.from(
    { length: Math.max(0, newest + 1) },
    (_unused, offset) => newest - offset,
  )
    .filter((index) => index >= 3)
    .slice(0, limit)
    .map(decisionOf);
  return pageResponse(items, null);
}

function indexAt(openTime: number): number {
  return Math.floor((openTime - FIRST_CANDLE) / HOUR);
}

function Pointer({ candles }: { readonly candles: readonly number[] }): ReactElement {
  const [pointed, setPointed] = useState<number | undefined>(undefined);
  return (
    <>
      {candles.map((index) => (
        <button key={index} type="button" onClick={() => setPointed(FIRST_CANDLE + index * HOUR)}>
          {`apontar ${index}`}
        </button>
      ))}
      <button type="button" onClick={() => setPointed(undefined)}>
        apontar nenhuma
      </button>
      <TeamAside pointedOpenTime={pointed} />
    </>
  );
}

function openHistorical(options: OpenOptions = {}): Server {
  const { kind = 'backtest', candles = [7, 8, 1], isFailing = false } = options;
  const server: Server = { calls: [], isFailing };
  renderApp({
    path: '/',
    isAuthenticated: true,
    routes: [
      {
        method: 'GET',
        path: `${LIVE_BASE}/decisions`,
        respond: (call): Response => {
          server.calls.push(call);
          return server.isFailing ? errorResponse(503, 'UNAVAILABLE') : decisionsResponse(call);
        },
      },
      {
        method: 'GET',
        path: `${LIVE_BASE}/projections`,
        respond: (): Response =>
          dataResponse(buildProjectionsResponse({ summary: buildProjectionsSummary() })),
      },
      {
        method: 'GET',
        path: '/v1/me',
        respond: (): Response =>
          dataResponse({
            id: 'user-1',
            displayName: null,
            displayCurrency: 'BRL',
            timezone: 'America/Sao_Paulo',
            alertTelegramEnabled: false,
            telegramLinked: false,
            createdAt: '2026-01-01T00:00:00.000Z',
          }),
      },
    ],
    probe: (
      <RunTeamAside runId={LIVE_RUN_ID} kind={kind} timeframe="1h">
        <Pointer candles={candles} />
      </RunTeamAside>
    ),
  });
  return server;
}

function team(): HTMLElement {
  return screen.getByRole('complementary', TEAM_NAME);
}

async function teamText(expected: string): Promise<string> {
  await waitFor(() => expect(team().textContent).toContain(expected));
  return team().textContent ?? '';
}

describe('a equipe em backtest e walk-forward concluídos', () => {
  test.each(['backtest', 'walk_forward'])(
    'a %s mostra a opinião gravada na última vela, sem analista de risco',
    async (kind) => {
      const server = openHistorical({ kind });
      const text = await teamText('Última vela da execução, fechou');
      expect(text).toContain('Reversão');
      expect(text).toContain('Resumo');
      expect(text).not.toContain('Analista de risco');
      expect(text).toContain('Opiniões gravadas pela execução sobre o passado');
      expect(server.calls[0]?.query.get('limit')).toBe('1');
      expect(server.calls[0]?.query.get('at')).toBeNull();
    },
  );

  test('apontar uma vela pede a janela dela uma vez e mostra o que a equipe disse NAQUELA vela', async () => {
    const server = openHistorical();
    await teamText('Última vela da execução');
    fireEvent.click(screen.getByRole('button', { name: 'apontar 7' }));
    const text = await teamText('Vela apontada no gráfico, fechou');
    expect(text).toContain('Na vela 7 o RSI (22) votou a favor.');
    const pointedCalls = server.calls.filter((call) => call.query.get('at') !== null);
    expect(pointedCalls).toHaveLength(1);
    expect(pointedCalls[0]?.query.get('limit')).toBe('100');
    fireEvent.click(screen.getByRole('button', { name: 'apontar 8' }));
    await waitFor(() => expect(team().textContent).not.toContain('Na vela 7'));
    expect(server.calls.filter((call) => call.query.get('at') !== null)).toHaveLength(1);
  });

  test('voltar a nenhuma vela apontada volta à última, sem pedir de novo', async () => {
    const server = openHistorical();
    await teamText('Última vela da execução');
    fireEvent.click(screen.getByRole('button', { name: 'apontar 7' }));
    await teamText('Vela apontada no gráfico');
    fireEvent.click(screen.getByRole('button', { name: 'apontar nenhuma' }));
    await teamText('Última vela da execução');
    expect(server.calls.filter((call) => call.query.get('at') === null)).toHaveLength(1);
  });

  test('vela sem decisão gravada diz a frase honesta, sem inventar fala', async () => {
    openHistorical();
    await teamText('Última vela da execução');
    fireEvent.click(screen.getByRole('button', { name: 'apontar 1' }));
    const text = await teamText('A equipe não opinou nesta vela');
    expect(text).not.toContain('Reversão');
    expect(text).not.toContain('Resumo');
  });

  test('o servidor recusando mantém a coluna, com o botão de tentar de novo', async () => {
    const server = openHistorical({ isFailing: true });
    await teamText('Não deu para carregar a equipe agora.');
    server.isFailing = false;
    fireEvent.click(within(team()).getByRole('button', { name: 'Tentar de novo' }));
    await teamText('Última vela da execução');
  });

  test('a frase de motivo por regra não é inventada: só voto e leitura gravados', async () => {
    openHistorical();
    const text = await teamText('Última vela da execução');
    expect(text).not.toContain(RULE_MOTIVE);
  });
});

describe('a janela de decisões que cobre a vela apontada', () => {
  test('sem vela apontada não há âncora, e a vela apontada cai no bloco de 100 velas', () => {
    expect(windowAnchorFor(undefined, HOUR)).toBeUndefined();
    const span = 100 * HOUR;
    const anchor = windowAnchorFor(span * 3 + 5 * HOUR, HOUR);
    expect(anchor).toBe(span * 4 - 1);
    expect(windowAnchorFor(span * 4 - HOUR, HOUR)).toBe(anchor);
    expect(windowAnchorFor(span * 4, HOUR)).toBe(span * 5 - 1);
  });

  test('vela de duração desconhecida usa a própria vela como âncora', () => {
    expect(windowAnchorFor(1_234, undefined)).toBe(1_234);
  });
});
