// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { HTTP_STATUS } from '@ativada/environment';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import {
  dataResponse,
  errorResponse,
  jsonResponse,
  pageResponse,
  type FakeRoute,
} from './support/fake-fetch.js';
import { renderApp } from './support/render-app.js';
import { buildRun, buildStrategy, buildVersion, CLASSIC_CONFIG } from './support/run-fixtures.js';

const EXAMPLE = buildStrategy({ id: 'strategy-example', name: 'Placar clássico', isExample: true });
const OWN = buildStrategy({ id: 'strategy-1', name: 'Minha regra' });
const OLD_CONFIG = { ...CLASSIC_CONFIG, thresholds: { buy: '1.5', sell: '-2' } };
const VERSION_2 = buildVersion({ id: 'version-2', version: 2, configHash: 'b'.repeat(64) });
const VERSION_1 = buildVersion({ config: OLD_CONFIG, configHash: 'a'.repeat(64) });

function strategyRoutes(overrides: readonly FakeRoute[] = []): readonly FakeRoute[] {
  return [
    ...overrides,
    {
      method: 'GET',
      path: '/v1/strategies',
      respond: (): Response => pageResponse([EXAMPLE, OWN]),
    },
    {
      method: 'GET',
      path: '/v1/strategies/strategy-example',
      respond: (): Response =>
        dataResponse({
          ...EXAMPLE,
          latestVersion: buildVersion({ strategyId: 'strategy-example' }),
        }),
    },
    {
      method: 'GET',
      path: '/v1/strategies/strategy-1',
      respond: (): Response => dataResponse({ ...OWN, latestVersion: VERSION_2 }),
    },
    {
      method: 'GET',
      path: '/v1/strategies/strategy-1/versions',
      respond: (): Response => pageResponse([VERSION_2, VERSION_1]),
    },
    {
      method: 'GET',
      path: '/v1/strategies/strategy-example/versions',
      respond: (): Response => pageResponse([buildVersion({ strategyId: 'strategy-example' })]),
    },
  ];
}

describe('strategy list', () => {
  test('lists the strategies, marks the example and offers to duplicate every one', async () => {
    renderApp({ path: '/estrategias', isAuthenticated: true, routes: strategyRoutes() });
    const list = await screen.findByRole('list', { name: 'Suas estratégias' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain('Exemplo');
    expect(within(items[0] ?? list).queryByRole('button', { name: /Apagar/ })).toBeNull();
    expect(
      within(items[1] ?? list).getByRole('button', { name: 'Apagar Minha regra' }),
    ).toBeDefined();
    expect(
      within(items[0] ?? list)
        .getByRole('link', { name: 'Placar clássico' })
        .getAttribute('href'),
    ).toBe('/estrategias/strategy-example');
  });

  test('duplicating copies the latest configuration under a new name and opens it', async () => {
    const copy = buildStrategy({ id: 'strategy-new', name: 'Placar clássico (cópia)' });
    const { fake, router } = renderApp({
      path: '/estrategias',
      isAuthenticated: true,
      routes: strategyRoutes([
        {
          method: 'POST',
          path: '/v1/strategies',
          respond: (): Response =>
            dataResponse(
              { strategy: copy, version: buildVersion({ strategyId: 'strategy-new' }) },
              HTTP_STATUS.CREATED,
            ),
        },
      ]),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Duplicar Placar clássico' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/estrategias/strategy-new'));
    expect(fake.callsTo('POST', '/v1/strategies')[0]?.body).toEqual({
      name: 'Placar clássico (cópia)',
      config: CLASSIC_CONFIG,
    });
  });

  test('deleting asks for confirmation first, then removes it', async () => {
    const { fake } = renderApp({
      path: '/estrategias',
      isAuthenticated: true,
      routes: strategyRoutes([
        {
          method: 'DELETE',
          path: '/v1/strategies/strategy-1',
          respond: (): Response => new Response(null, { status: HTTP_STATUS.NO_CONTENT }),
        },
      ]),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Apagar Minha regra' }));
    expect(fake.callsTo('DELETE', '/v1/strategies/strategy-1')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar: apagar Minha regra' }));
    await waitFor(() =>
      expect(fake.callsTo('DELETE', '/v1/strategies/strategy-1')).toHaveLength(1),
    );
  });

  test('cancelling the confirmation keeps the strategy', async () => {
    const { fake } = renderApp({
      path: '/estrategias',
      isAuthenticated: true,
      routes: strategyRoutes(),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Apagar Minha regra' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: 'Apagar Minha regra' })).toBeDefined();
    expect(fake.callsTo('DELETE', '/v1/strategies/strategy-1')).toHaveLength(0);
  });
});

describe('strategy editor', () => {
  async function open(extra: readonly FakeRoute[] = []): Promise<ReturnType<typeof renderApp>> {
    const rendered = renderApp({
      path: '/estrategias/strategy-1',
      isAuthenticated: true,
      routes: strategyRoutes(extra),
    });
    await screen.findByLabelText('Limiar de compra');
    return rendered;
  }

  test('shows the name, the current version with its short hash and the parameters by section', async () => {
    await open();
    expect(screen.getByRole('heading', { name: 'Minha regra' })).toBeDefined();
    expect(screen.getAllByText(/versão 2/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/bbbbbbbb/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Limiar de compra')).toHaveProperty('value', '2');
    expect(screen.getByLabelText('EMA 9 x 21: período rápido')).toHaveProperty('value', '9');
    expect(screen.getByRole('group', { name: 'Risco' })).toBeDefined();
    expect(screen.queryByLabelText(/schemaVersion|orderType/)).toBeNull();
  });

  test('saving builds a NEW version with only the edited values changed', async () => {
    const { fake } = await open([
      {
        method: 'POST',
        path: '/v1/strategies/strategy-1/versions',
        respond: (): Response =>
          dataResponse(
            { version: buildVersion({ id: 'version-3', version: 3, configHash: 'c'.repeat(64) }) },
            HTTP_STATUS.CREATED,
          ),
      },
    ]);
    expect(screen.getByRole('button', { name: 'Salvar como nova versão' })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.change(screen.getByLabelText('Limiar de compra'), { target: { value: '2.5' } });
    fireEvent.change(screen.getByLabelText('RSI 14: período'), { target: { value: '21' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar como nova versão' }));
    expect(await screen.findByText(/Versão 3 criada/)).toBeDefined();
    expect(screen.getAllByText(/cccccccc/).length).toBeGreaterThan(0);
    const body = fake.callsTo('POST', '/v1/strategies/strategy-1/versions')[0]?.body as {
      config: typeof CLASSIC_CONFIG;
    };
    expect(body.config.thresholds).toEqual({ buy: '2.5', sell: '-2' });
    expect(body.config.rules[1]).toEqual({
      id: 'rsi-14',
      kind: 'rsi',
      period: 21,
      oversold: 30,
      overbought: 70,
    });
    expect(body.config.risk).toEqual(CLASSIC_CONFIG.risk);
  });

  test('the message survives the list refetch that already brings the new version (editor is not remounted mid-save)', async () => {
    const version3 = buildVersion({ id: 'version-3', version: 3, configHash: 'c'.repeat(64) });
    let saved = false;
    const routes: readonly FakeRoute[] = [
      {
        method: 'POST',
        path: '/v1/strategies/strategy-1/versions',
        respond: (): Response => {
          saved = true;
          return dataResponse({ version: version3 }, HTTP_STATUS.CREATED);
        },
      },
      {
        method: 'GET',
        path: '/v1/strategies/strategy-1/versions',
        respond: (): Response =>
          pageResponse(saved ? [version3, VERSION_2, VERSION_1] : [VERSION_2, VERSION_1]),
      },
      {
        method: 'GET',
        path: '/v1/strategies/strategy-1',
        respond: (): Response =>
          dataResponse({ ...OWN, latestVersion: saved ? version3 : VERSION_2 }),
      },
    ];
    renderApp({
      path: '/estrategias/strategy-1',
      isAuthenticated: true,
      routes: strategyRoutes(routes),
    });
    fireEvent.change(await screen.findByLabelText('Limiar de compra'), {
      target: { value: '2.5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar como nova versão' }));
    expect(await screen.findByText(/Versão 3 criada/)).toBeDefined();
    await waitFor(() => expect(screen.getByText(/base: versão 3/)).toBeDefined());
    expect(screen.getByText(/Versão 3 criada/)).toBeDefined();
  });

  test('a lagging versions list right after saving does not flip the base back: version 3 stays the base and the notice stays', async () => {
    const version3 = buildVersion({ id: 'version-3', version: 3, configHash: 'c'.repeat(64) });
    let listCallsAfterSave = -1;
    renderApp({
      path: '/estrategias/strategy-1',
      isAuthenticated: true,
      routes: strategyRoutes([
        {
          method: 'POST',
          path: '/v1/strategies/strategy-1/versions',
          respond: (): Response => {
            listCallsAfterSave = 0;
            return dataResponse({ version: version3 }, HTTP_STATUS.CREATED);
          },
        },
        {
          method: 'GET',
          path: '/v1/strategies/strategy-1/versions',
          respond: (): Response => {
            if (listCallsAfterSave < 0) return pageResponse([VERSION_2, VERSION_1]);
            listCallsAfterSave += 1;
            return pageResponse(
              listCallsAfterSave === 1 ? [VERSION_2, VERSION_1] : [version3, VERSION_2, VERSION_1],
            );
          },
        },
      ]),
    });
    fireEvent.change(await screen.findByLabelText('Limiar de compra'), {
      target: { value: '2.5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar como nova versão' }));
    expect(await screen.findByText(/Versão 3 criada/)).toBeDefined();
    expect(screen.getByText(/base: versão 3/)).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(screen.getByText(/Versão 3 criada/)).toBeDefined();
    expect(screen.getByText(/base: versão 3/)).toBeDefined();
    expect(screen.getByText(/Versão atual: versão 3/)).toBeDefined();
  });

  test('the same configuration answers with the existing version and says nothing changed', async () => {
    await open([
      {
        method: 'POST',
        path: '/v1/strategies/strategy-1/versions',
        respond: (): Response => dataResponse({ version: VERSION_2 }),
      },
    ]);
    fireEvent.change(screen.getByLabelText('Limiar de compra'), { target: { value: '2.0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar como nova versão' }));
    expect(await screen.findByText(/Nada mudou: é a versão 2/)).toBeDefined();
  });

  test('a bad number is caught before the request, naming the field', async () => {
    const { fake } = await open();
    fireEvent.change(screen.getByLabelText('Limiar de compra'), { target: { value: 'dois' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar como nova versão' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Limiar de compra');
    expect(fake.callsTo('POST', '/v1/strategies/strategy-1/versions')).toHaveLength(0);
  });

  test('the engine schema errors come back by field, with the label of each parameter', async () => {
    await open([
      {
        method: 'POST',
        path: '/v1/strategies/strategy-1/versions',
        respond: (): Response =>
          jsonResponse(
            {
              error: {
                code: 'REQUEST_VALIDATION_FAILED',
                message: 'inválido',
                details: [
                  { field: 'config.thresholds.buy', reason: 'invalid_value' },
                  { field: 'config.rules.1.period', reason: 'too_small' },
                ],
              },
            },
            HTTP_STATUS.BAD_REQUEST,
          ),
      },
    ]);
    fireEvent.change(screen.getByLabelText('Limiar de compra'), { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar como nova versão' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Limiar de compra');
    expect(alert.textContent).toContain('RSI 14: período');
  });

  test('lists every version and lets an old one be the base of the editor', async () => {
    await open();
    const versions = screen.getByRole('region', { name: 'Versões' });
    expect(within(versions).getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(within(versions).getByRole('button', { name: 'Usar a versão 1 como base' }));
    expect(screen.getByLabelText('Limiar de compra')).toHaveProperty('value', '1.5');
  });

  test('a strategy that is not yours (404) says so', async () => {
    renderApp({
      path: '/estrategias/strategy-x',
      isAuthenticated: true,
      routes: [
        {
          method: 'GET',
          path: '/v1/strategies/strategy-x',
          respond: (): Response => errorResponse(404, 'STRATEGY_NOT_FOUND'),
        },
        ...strategyRoutes(),
      ],
    });
    expect((await screen.findByRole('alert')).textContent).toContain('não encontrada');
  });
});

describe('walk-forward request', () => {
  async function open(extra: readonly FakeRoute[] = []): Promise<ReturnType<typeof renderApp>> {
    const rendered = renderApp({
      path: '/estrategias/strategy-1',
      isAuthenticated: true,
      routes: strategyRoutes(extra),
    });
    await screen.findByRole('button', { name: 'Pedir walk-forward' });
    return rendered;
  }

  test('asks for the grid, the period and shows how many combinations it makes', async () => {
    await open();
    fireEvent.change(screen.getByLabelText('Parâmetro 1'), { target: { value: 'thresholds.buy' } });
    fireEvent.change(screen.getByLabelText('Valores do parâmetro 1'), {
      target: { value: '1.5, 2, 2.5' },
    });
    expect(screen.getByText(/3 combinações/)).toBeDefined();
  });

  test('sends the request and opens the new run, which will show the out-of-sample report', async () => {
    const created = buildRun({
      id: 'run-wf',
      kind: 'walk_forward',
      status: 'queued',
      metrics: null,
    });
    const { fake, router } = await open([
      {
        method: 'POST',
        path: '/v1/runs',
        respond: (): Response => dataResponse(created, HTTP_STATUS.ACCEPTED),
      },
      { method: 'GET', path: '/v1/runs/run-wf', respond: (): Response => dataResponse(created) },
    ]);
    fireEvent.change(screen.getByLabelText('Parâmetro 1'), { target: { value: 'thresholds.buy' } });
    fireEvent.change(screen.getByLabelText('Valores do parâmetro 1'), {
      target: { value: '1.5, 2' },
    });
    fireEvent.change(screen.getByLabelText('Início do walk-forward'), {
      target: { value: '2024-01-01' },
    });
    fireEvent.change(screen.getByLabelText('Fim do walk-forward'), {
      target: { value: '2026-01-01' },
    });
    fireEvent.change(screen.getByLabelText('Timeframe do walk-forward'), {
      target: { value: '1d' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pedir walk-forward' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/backtests/run-wf'));
    expect(fake.callsTo('POST', '/v1/runs')[0]?.body).toEqual({
      strategyVersionId: 'version-2',
      kind: 'walk_forward',
      symbol: 'BTCUSDT',
      timeframe: '1d',
      periodStart: Date.parse('2024-01-01T00:00:00.000Z'),
      periodEnd: Date.parse('2026-01-01T00:00:00.000Z'),
      grid: { parameters: [{ path: 'thresholds.buy', values: ['1.5', '2'] }] },
    });
  });

  test('blocks an empty grid and reports it', async () => {
    const { fake } = await open();
    fireEvent.click(screen.getByRole('button', { name: 'Pedir walk-forward' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Parâmetro 1');
    expect(fake.callsTo('POST', '/v1/runs')).toHaveLength(0);
  });
});
