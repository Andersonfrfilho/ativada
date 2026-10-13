// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { HTTP_STATUS } from '@ativada/environment';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { dataResponse, errorResponse, pageResponse, type FakeRoute } from './support/fake-fetch.js';
import { buildCombination, buildEvaluation, buildGoal } from './support/goal-fixtures.js';
import { renderApp } from './support/render-app.js';
import { buildRun } from './support/run-fixtures.js';

const LEGEND = 'De quanto em quanto tempo olhar o mercado';
const SIMULATE = 'Simular esta meta com Placar clássico';

function liveRun(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return buildRun({
    id,
    kind: 'live_paper',
    status: 'running',
    timeframe: '1h',
    strategyVersionId: 'other-version',
    ...overrides,
  });
}

function open(
  runs: readonly Record<string, unknown>[],
  extra: readonly FakeRoute[] = [],
): ReturnType<typeof renderApp> {
  return renderApp({
    path: '/metas/goal-1',
    isAuthenticated: true,
    routes: [
      ...extra,
      {
        method: 'GET',
        path: '/v1/goals/goal-1',
        respond: (): Response => dataResponse(buildGoal()),
      },
      {
        method: 'GET',
        path: '/v1/goals/goal-1/evaluation',
        respond: (): Response => dataResponse(buildEvaluation([buildCombination()])),
      },
      { method: 'GET', path: '/v1/runs', respond: (): Response => pageResponse(runs) },
    ],
  });
}

function acceptRun(): FakeRoute {
  return {
    method: 'POST',
    path: '/v1/runs',
    respond: (): Response =>
      dataResponse(liveRun('run-new', { goalId: 'goal-1' }), HTTP_STATUS.ACCEPTED),
  };
}

describe('simulation timeframe picker', () => {
  test('is a radio group with 1 hour chosen, a sentence per option and the daily ranking notice', async () => {
    open([]);
    const group = await screen.findByRole('group', { name: LEGEND });
    expect(screen.getByRole('radio', { name: '1 hora' })).toHaveProperty('checked', true);
    expect(screen.getByRole('radio', { name: '4 horas' })).toHaveProperty('checked', false);
    expect(screen.getByRole('radio', { name: '1 dia' })).toHaveProperty('checked', false);
    expect(group.textContent).toContain('A cada 1 hora: até 24 decisões por dia.');
    expect(group.textContent).toContain('A cada 4 horas: até 6 por dia.');
    expect(group.textContent).toContain('Uma vez por dia, às 21:00 (horário de Brasília).');
    expect(group.textContent).toContain(
      'O ranking desta meta é calculado com velas diárias. Simular com velas menores é um teste ao vivo: o resultado pode ser diferente e não muda o ranking.',
    );
    expect(group.textContent).toContain(
      'A simulação olha o mercado a cada 1 hora. Primeira vela fecha às',
    );
  });

  test('screen reader and keyboard: native radios of one group, each described by its sentence', async () => {
    open([]);
    const four = await screen.findByRole('radio', { name: '4 horas' });
    const radios = screen.getAllByRole('radio');
    expect(new Set(radios.map((radio) => radio.getAttribute('name'))).size).toBe(1);
    const hintId = four.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(hintId)?.textContent).toBe('A cada 4 horas: até 6 por dia.');
    expect(radios.every((radio) => radio.tabIndex !== -1)).toBe(true);
  });

  test('15 min hides behind "Mais opções" and brings the fees warning when chosen', async () => {
    open([]);
    const more = await screen.findByRole('button', { name: 'Mais opções' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText(/as taxas pesam mais/)).toBeNull();
    fireEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: '15 minutos' }));
    expect(
      await screen.findByText(/Com velas de 15 min a estratégia opera mais vezes/),
    ).toBeDefined();
    expect(more.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('creating the simulation with the chosen timeframe', () => {
  test('the default sends 1h', async () => {
    const { fake } = open([], [acceptRun()]);
    fireEvent.click(await screen.findByRole('button', { name: SIMULATE }));
    await waitFor(() => expect(fake.callsTo('POST', '/v1/runs')).toHaveLength(1));
    expect(fake.callsTo('POST', '/v1/runs')[0]?.body).toMatchObject({ timeframe: '1h' });
  });

  test.each([
    ['4 horas', '4h'],
    ['1 dia', '1d'],
  ])('choosing %s sends %s', async (name, timeframe) => {
    const { fake } = open([], [acceptRun()]);
    fireEvent.click(await screen.findByRole('radio', { name }));
    fireEvent.click(await screen.findByRole('button', { name: SIMULATE }));
    await waitFor(() => expect(fake.callsTo('POST', '/v1/runs')).toHaveLength(1));
    expect(fake.callsTo('POST', '/v1/runs')[0]?.body).toMatchObject({ timeframe });
  });

  test('15 min is sent when chosen under "Mais opções"', async () => {
    const { fake } = open([], [acceptRun()]);
    fireEvent.click(await screen.findByRole('button', { name: 'Mais opções' }));
    fireEvent.click(screen.getByRole('radio', { name: '15 minutos' }));
    fireEvent.click(screen.getByRole('button', { name: SIMULATE }));
    await waitFor(() => expect(fake.callsTo('POST', '/v1/runs')).toHaveLength(1));
    expect(fake.callsTo('POST', '/v1/runs')[0]?.body).toMatchObject({ timeframe: '15m' });
  });

  test('the 409 limit comes back with the sentence of RF05', async () => {
    open(
      [],
      [
        {
          method: 'POST',
          path: '/v1/runs',
          respond: (): Response => errorResponse(HTTP_STATUS.CONFLICT, 'LIVE_RUN_LIMIT_REACHED'),
        },
      ],
    );
    fireEvent.click(await screen.findByRole('button', { name: SIMULATE }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Você chegou ao limite de 5 simulações ao vivo. Pare uma para começar outra.',
    );
  });
});

describe('how many simulations, duplicates and the limit', () => {
  test('counts the active ones: "3 de 5"; stopped ones do not count', async () => {
    open([
      liveRun('run-a'),
      liveRun('run-b', { status: 'queued' }),
      liveRun('run-c'),
      liveRun('run-d', { status: 'completed' }),
    ]);
    expect(await screen.findByText('Você tem 3 de 5 simulações ao vivo.')).toBeDefined();
  });

  test('the same strategy, pair and candle warns and links to it, without blocking', async () => {
    const { fake } = open([liveRun('run-same', { strategyVersionId: 'version-1' })], [acceptRun()]);
    await screen.findByText(/Você já tem esta simulação rodando/);
    const link = screen.getByRole('link', { name: 'Ver a simulação que já está rodando' });
    expect(link.getAttribute('href')).toBe('/backtests/run-same');
    const button = screen.getByRole('button', { name: SIMULATE });
    expect(button).toHaveProperty('disabled', false);
    fireEvent.click(button);
    await waitFor(() => expect(fake.callsTo('POST', '/v1/runs')).toHaveLength(1));
  });

  test('another candle for the same strategy and pair is allowed with no warning', async () => {
    open([liveRun('run-same', { strategyVersionId: 'version-1' })]);
    await screen.findByText(/Você já tem esta simulação rodando/);
    fireEvent.click(screen.getByRole('radio', { name: '4 horas' }));
    await waitFor(() =>
      expect(screen.queryByText(/Você já tem esta simulação rodando/)).toBeNull(),
    );
  });

  test('at the limit of 5 the button is disabled and says why', async () => {
    const { fake } = open(['a', 'b', 'c', 'd', 'e'].map((suffix) => liveRun(`run-${suffix}`)));
    const button = await screen.findByRole('button', { name: SIMULATE });
    await waitFor(() => expect(button).toHaveProperty('disabled', true));
    const reason = 'Você chegou ao limite de 5 simulações ao vivo. Pare uma para começar outra.';
    expect(screen.getByText(reason)).toBeDefined();
    const describedBy = button.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy)?.textContent).toBe(reason);
    expect(screen.getByText('Você tem 5 de 5 simulações ao vivo.')).toBeDefined();
    fireEvent.click(button);
    expect(fake.callsTo('POST', '/v1/runs')).toHaveLength(0);
  });
});
