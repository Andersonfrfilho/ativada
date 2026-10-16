// Copyright (c) 2026 Ada Technology. All rights reserved.
import { beforeEach, describe, expect, test } from 'bun:test';

import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { RECENT_RUNS_STORAGE_KEY } from '../src/backtests/run-switch/run-switch.constant.js';
import {
  dataResponse,
  errorResponse,
  pageResponse,
  type FakeRoute,
  type RecordedCall,
} from './support/fake-fetch.js';
import { renderApp, type RenderedApp } from './support/render-app.js';
import {
  buildMetrics,
  buildRun,
  buildStrategy,
  buildVersion,
  metricValue,
} from './support/run-fixtures.js';

function backtest(
  id: string,
  symbol: string,
  timeframe: string,
  totalReturn: string,
  trades = 7,
): Record<string, unknown> {
  return buildRun({
    id,
    symbol,
    timeframe,
    metrics: buildMetrics({ totalReturn: metricValue(totalReturn), trades }),
  });
}

const BTC_HOUR = backtest('btc-hour', 'BTCUSDT', '1h', '0.0326');
const BTC_FOUR = backtest('btc-four', 'BTCUSDT', '4h', '-0.011', 1);
const ETH_HOUR = backtest('eth-hour', 'ETHUSDT', '1h', '0.01');
const BTC_WALK = buildRun({ id: 'btc-walk', kind: 'walk_forward', symbol: 'BTCUSDT' });
const BTC_LIVE = buildRun({
  id: 'btc-live',
  kind: 'live_paper',
  status: 'running',
  symbol: 'BTCUSDT',
  periodEnd: null,
  metrics: null,
});

const EVERY_RUN = [BTC_LIVE, BTC_HOUR, BTC_FOUR, ETH_HOUR, BTC_WALK];

type Listing = (call: RecordedCall) => Response;

function byFilters(call: RecordedCall): Response {
  const kind = call.query.get('kind');
  const symbol = call.query.get('symbol');
  const items = EVERY_RUN.filter(
    (run) => run.kind === kind && (symbol === null || run.symbol === symbol),
  );
  return pageResponse(items);
}

function buildRoutes(listing: Listing = byFilters): readonly FakeRoute[] {
  return [
    {
      method: 'GET',
      path: '/v1/strategies',
      respond: (): Response => pageResponse([buildStrategy()]),
    },
    {
      method: 'GET',
      path: '/v1/strategies/strategy-1/versions',
      respond: (): Response => pageResponse([buildVersion()]),
    },
    { method: 'GET', path: '/v1/runs', respond: listing },
    ...EVERY_RUN.map((run): FakeRoute => ({
      method: 'GET',
      path: `/v1/runs/${String(run['id'])}`,
      respond: (): Response => dataResponse(run),
    })),
  ];
}

async function openDetail(path: string, listing?: Listing): Promise<RenderedApp> {
  const app = renderApp({ path, isAuthenticated: true, routes: buildRoutes(listing) });
  await screen.findByRole('button', { name: /Trocar execução/ });
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeDefined());
  return app;
}

async function openPanel(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByRole('button', { name: /Trocar execução/ }));
  return screen.findByRole('dialog', { name: 'Trocar execução' });
}

function search(): HTMLInputElement {
  const field = screen.getByRole('combobox');
  if (!(field instanceof HTMLInputElement)) throw new Error('A busca não é um campo de texto.');
  return field;
}

function optionNames(): string[] {
  return screen.queryAllByRole('option').map((option) => option.textContent ?? '');
}

beforeEach(() => {
  localStorage.clear();
});

describe('troca rápida de execução: a lista', () => {
  test('groups by kind with the result as icon, word and number on each row', async () => {
    await openDetail('/backtests/btc-hour');
    await openPanel();
    await waitFor(() => expect(screen.getAllByRole('group').length).toBeGreaterThan(2));
    const titles = ['Ao vivo', 'Backtests', 'Walk-forward'];
    for (const title of titles) {
      expect(screen.getByRole('group', { name: title })).toBeDefined();
    }
    const backtests = screen.getByRole('group', { name: 'Backtests' });
    expect(within(backtests).getByText('+3,26% · 7 operações')).toBeDefined();
    expect(within(backtests).getByText('−1,10% · 1 operação')).toBeDefined();
    expect(
      within(screen.getByRole('group', { name: 'Ao vivo' })).getByText('Rodando'),
    ).toBeDefined();
  });

  test('is a real combobox: listbox, options, selected option and the focus on the search', async () => {
    await openDetail('/backtests/btc-hour');
    const panel = await openPanel();
    await waitFor(() => expect(optionNames().length).toBeGreaterThan(3));
    const field = search();
    const listbox = within(panel).getByRole('listbox', { name: 'Execuções' });
    expect(field.getAttribute('aria-controls')).toBe(listbox.id);
    expect(document.activeElement).toBe(field);
    const active = document.getElementById(field.getAttribute('aria-activedescendant') ?? '');
    expect(active?.getAttribute('role')).toBe('option');
    expect(active?.getAttribute('aria-selected')).toBe('true');
    expect(panel.getAttribute('aria-modal')).toBe('true');
  });

  test('typing filters by coin, strategy, kind and candle, and announces the count', async () => {
    await openDetail('/backtests/btc-hour');
    const panel = await openPanel();
    await waitFor(() => expect(optionNames().length).toBeGreaterThan(3));
    fireEvent.change(search(), { target: { value: 'eth' } });
    expect(optionNames()).toHaveLength(1);
    expect(within(panel).getByRole('status').textContent).toBe('1 execução encontrada.');
    fireEvent.change(search(), { target: { value: 'walk forward' } });
    expect(optionNames()).toHaveLength(1);
    fireEvent.change(search(), { target: { value: 'btc/usdt 4H' } });
    expect(optionNames()).toHaveLength(1);
    fireEvent.change(search(), { target: { value: 'placar' } });
    expect(optionNames().length).toBeGreaterThan(3);
    fireEvent.change(search(), { target: { value: 'dogecoin' } });
    expect(screen.getByText('Nada encontrado. Tente outra palavra.')).toBeDefined();
    expect(within(panel).getByRole('status').textContent).toBe('Nenhuma execução encontrada.');
  });

  test('arrows move the active option, Enter opens it and Escape closes returning the focus', async () => {
    const app = await openDetail('/backtests/btc-hour');
    await openPanel();
    await waitFor(() => expect(optionNames().length).toBeGreaterThan(3));
    fireEvent.change(search(), { target: { value: 'btc' } });
    const first = search().getAttribute('aria-activedescendant');
    fireEvent.keyDown(search(), { key: 'ArrowDown' });
    const second = search().getAttribute('aria-activedescendant');
    expect(second).not.toBe(first);
    fireEvent.keyDown(search(), { key: 'ArrowUp' });
    expect(search().getAttribute('aria-activedescendant')).toBe(first);
    fireEvent.keyDown(search(), { key: 'ArrowDown' });
    fireEvent.keyDown(search(), { key: 'ArrowDown' });
    fireEvent.keyDown(search(), { key: 'Enter' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(app.router.state.location.pathname).not.toBe('/backtests/btc-hour'));
    const trigger = screen.getByRole('button', { name: /Trocar execução/ });
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    await screen.findByRole('dialog');
    fireEvent.keyDown(search(), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  test('clicking an option switches the run without reloading the page frame', async () => {
    const app = await openDetail('/backtests/btc-hour');
    const trigger = screen.getByRole('button', { name: /Trocar execução/ });
    await openPanel();
    await waitFor(() => expect(optionNames().length).toBeGreaterThan(3));
    fireEvent.click(screen.getByRole('option', { name: /ETH\/USDT · 1h · Backtest/ }));
    await waitFor(() => expect(app.router.state.location.pathname).toBe('/backtests/eth-hour'));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('ETH/USDT'),
    );
    expect(screen.getByRole('button', { name: /Trocar execução/ })).toBe(trigger);
  });

  test('the coin chip goes to the API and only the opened list asks for the other kinds', async () => {
    const app = await openDetail('/backtests/btc-hour');
    const before = app.fake.callsTo('GET', '/v1/runs').length;
    expect(before).toBe(1);
    await openPanel();
    await waitFor(() => expect(optionNames().length).toBeGreaterThan(3));
    fireEvent.click(screen.getByRole('button', { name: 'ETH' }));
    await waitFor(() => expect(optionNames()).toHaveLength(1));
    const symbols = app.fake.callsTo('GET', '/v1/runs').map((call) => call.query.get('symbol'));
    expect(symbols).toContain('ETHUSDT');
    const otherRuns = app.fake
      .callsTo('GET', '/v1/runs/btc-four')
      .concat(app.fake.callsTo('GET', '/v1/runs/eth-hour'));
    expect(otherRuns).toHaveLength(0);
  });

  test('says in its own words when the lists could not be loaded', async () => {
    await openDetail('/backtests/btc-hour', () => errorResponse(500, 'BOOM'));
    const panel = await openPanel();
    expect((await within(panel).findByRole('alert')).textContent).toContain('Não foi possível');
  });

  test('empty account says so', async () => {
    await openDetail('/backtests/btc-hour', () => pageResponse([]));
    const panel = await openPanel();
    expect(await within(panel).findByText('Nenhuma execução ainda.')).toBeDefined();
  });
});

describe('troca rápida de execução: anterior, próxima e atalhos', () => {
  test('follows the list of the same coin and kind, with the buttons and with [ and ]', async () => {
    const app = await openDetail('/backtests/btc-hour');
    const previous = screen.getByRole('button', { name: /Execução anterior/ });
    expect(previous.hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Próxima execução/ }));
    await waitFor(() => expect(app.router.state.location.pathname).toBe('/backtests/btc-four'));
    await screen.findByRole('button', { name: /Trocar execução/ });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Próxima execução/ }).hasAttribute('disabled'),
      ).toBe(true),
    );
    fireEvent.keyDown(document.body, { key: '[' });
    await waitFor(() => expect(app.router.state.location.pathname).toBe('/backtests/btc-hour'));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Próxima execução/ }).hasAttribute('disabled'),
      ).toBe(false),
    );
    fireEvent.keyDown(document.body, { key: ']' });
    await waitFor(() => expect(app.router.state.location.pathname).toBe('/backtests/btc-four'));
  });

  test('the shortcuts are ignored while typing in a field', async () => {
    const app = await openDetail('/backtests/btc-hour');
    await openPanel();
    fireEvent.keyDown(search(), { key: ']' });
    expect(app.router.state.location.pathname).toBe('/backtests/btc-hour');
  });

  test('at the end of what is loaded, next fetches the following page and goes to it', async () => {
    const listing: Listing = (call) => {
      if (call.query.get('kind') !== 'backtest' || call.query.get('symbol') !== 'BTCUSDT') {
        return pageResponse([]);
      }
      return call.query.get('cursor') === 'p2'
        ? pageResponse([BTC_FOUR])
        : pageResponse([BTC_HOUR], 'p2');
    };
    const app = await openDetail('/backtests/btc-hour', listing);
    const next = await screen.findByRole('button', { name: /Próxima execução/ });
    await waitFor(() => expect(next.hasAttribute('disabled')).toBe(false));
    fireEvent.click(next);
    await waitFor(() => expect(app.router.state.location.pathname).toBe('/backtests/btc-four'));
  });
});

describe('troca rápida de execução: recentes', () => {
  test('remembers the last visited runs in the browser, most recent first, and lists them', async () => {
    const app = await openDetail('/backtests/btc-hour');
    fireEvent.click(screen.getByRole('button', { name: /Próxima execução/ }));
    await waitFor(() => expect(app.router.state.location.pathname).toBe('/backtests/btc-four'));
    await waitFor(() => {
      const stored: unknown = JSON.parse(localStorage.getItem(RECENT_RUNS_STORAGE_KEY) ?? '[]');
      expect(Array.isArray(stored) && stored.map((item: { id: string }) => item.id)).toEqual([
        'btc-four',
        'btc-hour',
      ]);
    });
    await openPanel();
    const recent = await screen.findByRole('group', { name: 'Recentes' });
    expect(within(recent).getAllByRole('option')).toHaveLength(1);
    expect(within(recent).getByRole('option').textContent).toContain('BTC/USDT · 1h');
  });

  test('a broken browser storage does not break the screen', async () => {
    localStorage.setItem(RECENT_RUNS_STORAGE_KEY, '{ isto não é json');
    await openDetail('/backtests/btc-hour');
    await openPanel();
    await waitFor(() => expect(optionNames().length).toBeGreaterThan(3));
    expect(screen.queryByRole('group', { name: 'Recentes' })).toBeNull();
  });
});

describe('troca rápida de execução: execução que não existe', () => {
  test('keeps the bar so the person can go to another run', async () => {
    renderApp({
      path: '/backtests/ghost',
      isAuthenticated: true,
      routes: [
        ...buildRoutes(),
        {
          method: 'GET',
          path: '/v1/runs/ghost',
          respond: (): Response => errorResponse(404, 'RUN_NOT_FOUND'),
        },
      ],
    });
    expect((await screen.findByRole('alert')).textContent).toContain('Execução não encontrada.');
    expect(screen.getByRole('group', { name: 'Trocar de execução' })).toBeDefined();
  });
});
