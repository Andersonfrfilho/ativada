// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { groupRuns, RESULT_ORDER, summarizeGroup } from '../src/backtests/run-groups.js';
import { runSchema } from '../src/runs/run.validation.js';
import { pageResponse, type FakeRoute } from './support/fake-fetch.js';
import { renderApp, type RenderedApp } from './support/render-app.js';
import {
  buildMetrics,
  buildRun,
  buildStrategy,
  buildVersion,
  metricValue,
} from './support/run-fixtures.js';

function parsedRun(
  id: string,
  version: string,
  totalReturn: string,
): ReturnType<typeof runSchema.parse> {
  return runSchema.parse(
    buildRun({
      id,
      strategyVersionId: version,
      metrics: buildMetrics({ totalReturn: metricValue(totalReturn) }),
    }),
  );
}

describe('ordem do resultado dentro do grupo', () => {
  const runs = [
    parsedRun('low', 'version-1', '-0.011'),
    parsedRun('high', 'version-1', '0.042'),
    parsedRun('mid', 'version-1', '0.01'),
  ];
  const idsOf = (order: Parameters<typeof groupRuns>[1]): readonly string[] =>
    (groupRuns(runs, order)[0]?.runs ?? []).map((item) => item.run.id);

  test('descending by default, ascending on request, API order when neutral', () => {
    expect(idsOf(RESULT_ORDER.DESC)).toEqual(['high', 'mid', 'low']);
    expect(idsOf(RESULT_ORDER.ASC)).toEqual(['low', 'mid', 'high']);
    expect(idsOf(RESULT_ORDER.NONE)).toEqual(['low', 'high', 'mid']);
  });

  test('best and worst do not depend on the order', () => {
    for (const order of Object.values(RESULT_ORDER)) {
      const [group] = groupRuns(runs, order);
      const summary = summarizeGroup(group ?? { key: '', runs: [] });
      expect(summary.best?.run.id).toBe('high');
      expect(summary.worst?.run.id).toBe('low');
    }
  });
});

const ROUTES: readonly FakeRoute[] = [
  {
    method: 'GET',
    path: '/v1/strategies',
    respond: (): Response => pageResponse([buildStrategy()]),
  },
  {
    method: 'GET',
    path: '/v1/strategies/strategy-1/versions',
    respond: (): Response =>
      pageResponse([buildVersion(), buildVersion({ id: 'version-2', version: 2 })]),
  },
  {
    method: 'GET',
    path: '/v1/runs',
    respond: (call): Response =>
      pageResponse(
        call.query.get('kind') === 'backtest'
          ? [
              buildRun({ id: 'a', symbol: 'BTCUSDT' }),
              buildRun({
                id: 'b',
                symbol: 'ETHUSDT',
                metrics: buildMetrics({ totalReturn: metricValue('-0.011') }),
              }),
              buildRun({ id: 'c', symbol: 'SOLUSDT', strategyVersionId: 'version-2' }),
            ]
          : [],
      ),
  },
];

function pick(elements: readonly HTMLElement[], index: number): HTMLElement {
  const element = elements[index];
  if (element === undefined) throw new Error(`elemento ${index} ausente`);
  return element;
}

async function openList(path = '/backtests'): Promise<{ app: RenderedApp; card: HTMLElement }> {
  const app = renderApp({ path, isAuthenticated: true, routes: ROUTES });
  const card = await screen.findByRole('region', { name: 'Backtests' });
  await within(card).findByRole('group', { name: 'Filtrar por estratégia (várias)' });
  return { app, card };
}

function searchOf(app: RenderedApp): URLSearchParams {
  return new URLSearchParams(app.router.state.location.search);
}

describe('filtros por estratégia na lista de backtests', () => {
  test('every strategy starts pressed and shows its group', async () => {
    const { card } = await openList();
    const chips = within(card).getAllByRole('button', { pressed: true });
    expect(chips).toHaveLength(2);
    expect(card.querySelectorAll('details')).toHaveLength(2);
  });

  test('turning one off shows only the other group and writes strategy to the URL', async () => {
    const { app, card } = await openList();
    fireEvent.click(pick(within(card).getAllByRole('button', { pressed: true }), 0));
    await waitFor(() => expect(card.querySelectorAll('details')).toHaveLength(1));
    expect(searchOf(app).getAll('strategy')).toEqual(['version-2']);
    fireEvent.click(pick(within(card).getAllByRole('button', { pressed: false }), 0));
    await waitFor(() => expect(card.querySelectorAll('details')).toHaveLength(2));
    expect(searchOf(app).has('strategy')).toBe(false);
  });

  test('the last selected strategy cannot be turned off', async () => {
    const { card } = await openList('/backtests?strategy=version-2');
    expect(card.querySelectorAll('details')).toHaveLength(1);
    fireEvent.click(pick(within(card).getAllByRole('button', { pressed: true }), 0));
    expect(card.querySelectorAll('details')).toHaveLength(1);
  });
});

describe('ordenação clicável do resultado', () => {
  test('cycles descending, ascending and neutral, reflected in aria-sort and the URL', async () => {
    const { app, card } = await openList();
    const header = (): HTMLElement =>
      pick(within(card).getAllByRole('columnheader', { name: /Resultado/ }), 0);
    expect(header().getAttribute('aria-sort')).toBe('descending');
    fireEvent.click(within(header()).getByRole('button'));
    await waitFor(() => expect(header().getAttribute('aria-sort')).toBe('ascending'));
    expect(searchOf(app).get('order')).toBe('asc');
    fireEvent.click(within(header()).getByRole('button'));
    await waitFor(() => expect(header().getAttribute('aria-sort')).toBe('none'));
    expect(searchOf(app).get('order')).toBe('none');
    fireEvent.click(within(header()).getByRole('button'));
    await waitFor(() => expect(header().getAttribute('aria-sort')).toBe('descending'));
    expect(searchOf(app).has('order')).toBe(false);
  });

  test('the order in the URL is read on load', async () => {
    const { card } = await openList('/backtests?order=asc');
    const [header] = within(card).getAllByRole('columnheader', { name: /Resultado/ });
    expect(header?.getAttribute('aria-sort')).toBe('ascending');
    const rows = card.querySelectorAll('details')[0]?.querySelectorAll('tbody tr') ?? [];
    expect(rows[0]?.textContent).toContain('ETH/USDT');
  });
});
