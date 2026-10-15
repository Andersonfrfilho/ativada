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
import { buildChartResponse, buildSummaryResponse } from './support/trade-chart-fixtures.js';
import {
  buildEquityCsv,
  buildMetrics,
  buildRun,
  buildStrategy,
  buildVersion,
  metricValue,
} from './support/run-fixtures.js';

const STRATEGY_ROUTES: readonly FakeRoute[] = [
  {
    method: 'GET',
    path: '/v1/strategies',
    respond: (): Response => pageResponse([buildStrategy()]),
  },
  {
    method: 'GET',
    path: '/v1/strategies/strategy-1/versions',
    respond: (): Response =>
      pageResponse([
        buildVersion({ id: 'version-2', version: 2, configHash: 'b'.repeat(64) }),
        buildVersion(),
      ]),
  },
];

function runRoutes(runs: Record<string, unknown>[]): readonly FakeRoute[] {
  return [
    {
      method: 'GET',
      path: '/v1/runs',
      respond: (call): Response =>
        pageResponse(runs.filter((run) => run['kind'] === (call.query.get('kind') ?? 'backtest'))),
    },
    ...runs.flatMap((run): FakeRoute[] => [
      {
        method: 'GET',
        path: `/v1/runs/${String(run['id'])}`,
        respond: (): Response => dataResponse(run),
      },
      {
        method: 'GET',
        path: `/v1/runs/${String(run['id'])}/export.csv`,
        respond: (): Response =>
          new Response(buildEquityCsv(500), { headers: { 'Content-Type': 'text/csv' } }),
      },
      {
        method: 'GET',
        path: `/v1/runs/${String(run['id'])}/trades`,
        respond: (): Response => pageResponse([]),
      },
      {
        method: 'GET',
        path: `/v1/runs/${String(run['id'])}/chart`,
        respond: (): Response => dataResponse(buildChartResponse()),
      },
      {
        method: 'GET',
        path: `/v1/runs/${String(run['id'])}/trade-summary`,
        respond: (): Response => dataResponse(buildSummaryResponse()),
      },
    ]),
  ];
}

describe('backtest list', () => {
  test('lists backtests and walk-forwards separately, with the result of each', async () => {
    const routes = [
      ...STRATEGY_ROUTES,
      ...runRoutes([
        buildRun({ id: 'run-1' }),
        buildRun({ id: 'run-wf', kind: 'walk_forward', symbol: 'ETHUSDT' }),
      ]),
    ];
    renderApp({ path: '/backtests', isAuthenticated: true, routes });
    const backtests = await screen.findByRole('region', { name: 'Backtests' });
    expect(await within(backtests).findByText('BTC/USDT')).toBeDefined();
    expect(backtests.textContent).toContain('+4,20%');
    const walkForwards = screen.getByRole('region', { name: 'Walk-forward' });
    expect(await within(walkForwards).findByText('ETH/USDT')).toBeDefined();
  });

  test('a run with a status or kind this panel does not know does not take the whole list down', async () => {
    const routes = [
      ...STRATEGY_ROUTES,
      ...runRoutes([
        buildRun({ id: 'run-1' }),
        buildRun({ id: 'run-new', status: 'paused', symbol: 'ETHUSDT' }),
      ]),
    ];
    renderApp({ path: '/backtests', isAuthenticated: true, routes });
    const backtests = await screen.findByRole('region', { name: 'Backtests' });
    expect(await within(backtests).findByText('BTC/USDT')).toBeDefined();
    expect(await within(backtests).findByText('ETH/USDT')).toBeDefined();
    expect(backtests.textContent).toContain('paused');
  });

  test('loads the next page by cursor on demand', async () => {
    let calls = 0;
    const routes: readonly FakeRoute[] = [
      ...STRATEGY_ROUTES,
      {
        method: 'GET',
        path: '/v1/runs',
        respond: (call): Response => {
          if (call.query.get('kind') !== 'backtest') return pageResponse([]);
          calls += 1;
          return call.query.get('cursor') === null
            ? pageResponse([buildRun({ id: 'run-1', symbol: 'BTCUSDT' })], 'next-1')
            : pageResponse([buildRun({ id: 'run-2', symbol: 'ETHUSDT' })]);
        },
      },
    ];
    renderApp({ path: '/backtests', isAuthenticated: true, routes });
    expect(await screen.findByText('BTC/USDT')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais backtests' }));
    expect(await screen.findByText('ETH/USDT')).toBeDefined();
    expect(calls).toBe(2);
    expect(screen.queryByRole('button', { name: 'Carregar mais backtests' })).toBeNull();
  });

  test('follows a run that is still going until it completes, without reloading', async () => {
    let polls = 0;
    const routes: readonly FakeRoute[] = [
      ...STRATEGY_ROUTES,
      {
        method: 'GET',
        path: '/v1/runs',
        respond: (call): Response => {
          if (call.query.get('kind') !== 'backtest') return pageResponse([]);
          polls += 1;
          return pageResponse([
            polls < 3
              ? buildRun({ id: 'run-1', status: 'running', progress: 50, metrics: null })
              : buildRun({ id: 'run-1' }),
          ]);
        },
      },
    ];
    renderApp({ path: '/backtests', isAuthenticated: true, routes });
    expect(await screen.findByText('Rodando')).toBeDefined();
    expect(await screen.findByText('+4,20%')).toBeDefined();
    expect(await screen.findByRole('checkbox', { name: /Comparar/ })).toBeDefined();
  });

  test('picks two completed runs and links to the side-by-side comparison', async () => {
    const routes = [
      ...STRATEGY_ROUTES,
      ...runRoutes([
        buildRun({ id: 'run-1' }),
        buildRun({ id: 'run-2' }),
        buildRun({ id: 'run-3' }),
      ]),
    ];
    renderApp({ path: '/backtests', isAuthenticated: true, routes });
    const boxes = await screen.findAllByRole('checkbox', { name: /Comparar/ });
    expect(boxes).toHaveLength(3);
    fireEvent.click(boxes[0] ?? document.body);
    fireEvent.click(boxes[1] ?? document.body);
    expect(boxes[2]).toHaveProperty('disabled', true);
    const link = screen.getByRole('link', { name: 'Comparar as 2 selecionadas' });
    expect(link.getAttribute('href')).toBe('/backtests/comparar?a=run-1&b=run-2');
  });
});

describe('new backtest', () => {
  async function openForm(
    routes: readonly FakeRoute[] = [],
  ): Promise<ReturnType<typeof renderApp>> {
    const rendered = renderApp({
      path: '/backtests',
      isAuthenticated: true,
      routes: [...STRATEGY_ROUTES, ...runRoutes([]), ...routes],
    });
    await screen.findByText(/Risco por operação/);
    return rendered;
  }

  test('starts with the documented defaults and shows the risk of the chosen version', async () => {
    await openForm();
    expect(screen.getByLabelText('Capital inicial')).toHaveProperty('value', '10000');
    expect(screen.getByLabelText('Taxa por ordem')).toHaveProperty('value', '0.001');
    expect(screen.getByLabelText('Slippage')).toHaveProperty('value', '0.0005');
    expect(screen.getByLabelText('Timeframe')).toHaveProperty('value', '1h');
    expect(await screen.findByText(/Risco por operação: 1,00%/)).toBeDefined();
  });

  test('the run button stays disabled while the strategies and their versions load', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    renderApp({
      path: '/backtests',
      isAuthenticated: true,
      routes: [
        STRATEGY_ROUTES[0] as FakeRoute,
        {
          method: 'GET',
          path: '/v1/strategies/strategy-1/versions',
          respond: async (): Promise<Response> => {
            await gate;
            return pageResponse([buildVersion()]);
          },
        },
        ...runRoutes([]),
      ],
    });
    const button = await screen.findByRole('button', { name: 'Rodar backtest' });
    expect(button).toHaveProperty('disabled', true);
    expect(screen.getByRole('status', { name: 'Carregando estratégias' })).toBeDefined();
    release();
    await waitFor(() => expect(button).toHaveProperty('disabled', false));
    expect(screen.queryByRole('status', { name: 'Carregando estratégias' })).toBeNull();
  });

  test('a failed strategy list says so and keeps the button disabled', async () => {
    renderApp({
      path: '/backtests',
      isAuthenticated: true,
      routes: [
        {
          method: 'GET',
          path: '/v1/strategies',
          respond: (): Response => errorResponse(500, 'BOOM'),
        },
        ...runRoutes([]),
      ],
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('estratégias');
    expect(screen.getByRole('button', { name: 'Rodar backtest' })).toHaveProperty('disabled', true);
  });

  test('sends the request the API expects and opens the new run', async () => {
    const created = buildRun({ id: 'run-new', status: 'queued', progress: 0, metrics: null });
    const { fake, router } = await openForm([
      {
        method: 'POST',
        path: '/v1/runs',
        respond: (): Response => dataResponse(created, HTTP_STATUS.ACCEPTED),
      },
      { method: 'GET', path: '/v1/runs/run-new', respond: (): Response => dataResponse(created) },
    ]);
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText('Par'), { target: { value: 'ETHUSDT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rodar backtest' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/backtests/run-new'));
    expect(fake.callsTo('POST', '/v1/runs')[0]?.body).toEqual({
      strategyVersionId: 'version-2',
      kind: 'backtest',
      symbol: 'ETHUSDT',
      timeframe: '1h',
      periodStart: Date.parse('2026-01-01T00:00:00.000Z'),
      periodEnd: Date.parse('2026-03-01T00:00:00.000Z'),
      runParameters: { initialBalance: '10000', feeRate: '0.001', slippageRate: '0.0005' },
    });
  });

  test('blocks a bad number or an upside-down period before calling the API', async () => {
    const { fake } = await openForm();
    fireEvent.change(screen.getByLabelText('Taxa por ordem'), { target: { value: 'abc' } });
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2026-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rodar backtest' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Taxa por ordem');
    expect(alert.textContent).toContain('Fim');
    expect(fake.callsTo('POST', '/v1/runs')).toHaveLength(0);
  });

  test('shows every problem the API reports, by field', async () => {
    await openForm([
      {
        method: 'POST',
        path: '/v1/runs',
        respond: (): Response =>
          jsonResponse(
            {
              error: {
                code: 'REQUEST_VALIDATION_FAILED',
                message: 'Corpo inválido.',
                details: [
                  { field: 'runParameters.feeRate', reason: 'invalid_value' },
                  { field: 'symbol', reason: 'not_enabled' },
                ],
              },
            },
            HTTP_STATUS.BAD_REQUEST,
          ),
      },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Rodar backtest' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Taxa por ordem');
    expect(alert.textContent).toContain('Par');
  });

  test('says when the queue is full', async () => {
    await openForm([
      {
        method: 'POST',
        path: '/v1/runs',
        respond: (): Response => errorResponse(HTTP_STATUS.TOO_MANY_REQUESTS, 'RUN_QUEUE_FULL'),
      },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Rodar backtest' }));
    expect((await screen.findByRole('alert')).textContent).toContain('fila');
  });
});

describe('backtest detail', () => {
  test('shows the queue position and then the progress while it runs, updating by itself', async () => {
    let polls = 0;
    const routes: readonly FakeRoute[] = [
      ...STRATEGY_ROUTES,
      {
        method: 'GET',
        path: '/v1/runs/run-1',
        respond: (): Response => {
          polls += 1;
          if (polls === 1) {
            return dataResponse(
              buildRun({
                status: 'queued',
                progress: 0,
                metrics: null,
                queuePosition: { own: 2, overall: 5 },
              }),
            );
          }
          return dataResponse(buildRun({ status: 'running', progress: 40, metrics: null }));
        },
      },
    ];
    renderApp({ path: '/backtests/run-1', isAuthenticated: true, routes });
    expect(await screen.findByText(/Posição na fila: 2/)).toBeDefined();
    await waitFor(() =>
      expect(
        screen
          .getByRole('progressbar', { name: 'Progresso da execução' })
          .getAttribute('aria-valuenow'),
      ).toBe('40'),
    );
  });

  test('cancels a queued run', async () => {
    const routes: readonly FakeRoute[] = [
      ...STRATEGY_ROUTES,
      {
        method: 'GET',
        path: '/v1/runs/run-1',
        respond: (): Response =>
          dataResponse(
            buildRun({
              status: 'queued',
              progress: 0,
              metrics: null,
              queuePosition: { own: 1, overall: 1 },
            }),
          ),
      },
      {
        method: 'POST',
        path: '/v1/runs/run-1/stop',
        respond: (): Response => dataResponse({ status: 'cancelled' }),
      },
    ];
    const { fake } = renderApp({ path: '/backtests/run-1', isAuthenticated: true, routes });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar execução' }));
    await waitFor(() => expect(fake.callsTo('POST', '/v1/runs/run-1/stop')).toHaveLength(1));
  });

  test('completed: metrics, equity curve, trades and costs', async () => {
    const routes: readonly FakeRoute[] = [
      ...STRATEGY_ROUTES,
      {
        method: 'GET',
        path: '/v1/runs/run-1/trades',
        respond: (): Response =>
          pageResponse([
            {
              engineKey: 't1',
              status: 'closed',
              entryPrice: '60000',
              quantity: '0.1',
              exitPrice: '61000',
              netProfit: '94.20',
              exitReason: 'target',
              openedCandleTime: 1_767_225_600_000,
              closedCandleTime: 1_767_229_200_000,
            },
          ]),
      },
    ];
    renderApp({
      path: '/backtests/run-1',
      isAuthenticated: true,
      routes: [...routes, ...runRoutes([buildRun()])],
    });
    const metrics = await screen.findByRole('region', { name: 'Resultado' });
    expect(metrics.textContent).toContain('+4,20%');
    expect(metrics.textContent).toContain('+1,10%');
    expect(metrics.textContent).toContain('5,20%');
    expect(metrics.textContent).toContain('85,30');
    expect(await screen.findByRole('img', { name: /Retorno acumulado/ })).toBeDefined();
    // A tabela antiga (abertura, preços de entrada e saída, resultado e motivo) agora é a do cartão "Preço e operações".
    const trades = await screen.findByRole('region', { name: 'Tabela de operações' });
    await waitFor(() => expect(trades.textContent).toContain('31/12/2025 21:00'));
    for (const field of [
      '31/12/2025 22:00',
      '60.000,00',
      '61.000,00',
      '+94,20',
      'atingiu o alvo de lucro',
    ]) {
      expect(trades.textContent).toContain(field);
    }
    expect(screen.getByRole('region', { name: 'Preço e operações' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'Custos incluídos' }).textContent).toContain('0,10%');
  });

  test('a finished backtest carries the "history is not a promise" notice', async () => {
    renderApp({
      path: '/backtests/run-1',
      isAuthenticated: true,
      routes: [...STRATEGY_ROUTES, ...runRoutes([buildRun({ id: 'run-1' })])],
    });
    const note = await screen.findByRole('note', { name: 'Leia com cuidado' });
    expect(note.textContent).toContain('histórico');
    expect(note.textContent).toContain('não promete');
  });

  test('names the strategy and version that produced the run, with the short hash', async () => {
    renderApp({
      path: '/backtests/run-1',
      isAuthenticated: true,
      routes: [...STRATEGY_ROUTES, ...runRoutes([buildRun({ strategyVersionId: 'version-2' })])],
    });
    expect(await screen.findByText(/Placar clássico · versão 2/)).toBeDefined();
    expect(screen.getByText(/bbbbbbbb/)).toBeDefined();
  });

  test('unavailable metrics say why instead of showing zero', async () => {
    const run = buildRun({
      metrics: buildMetrics({
        sharpe: metricValue(null, 'zero_volatility'),
        profitFactor: metricValue(null, 'no_losses'),
        trades: 0,
      }),
    });
    renderApp({
      path: '/backtests/run-1',
      isAuthenticated: true,
      routes: [...STRATEGY_ROUTES, ...runRoutes([run])],
    });
    const metrics = await screen.findByRole('region', { name: 'Resultado' });
    expect(metrics.textContent).toContain('sem oscilação');
    expect(metrics.textContent).toContain('sem perdas');
  });

  test('a failed run explains the stable error code', async () => {
    const run = buildRun({ status: 'failed', metrics: null, errorCode: 'NO_CANDLES' });
    renderApp({
      path: '/backtests/run-1',
      isAuthenticated: true,
      routes: [...STRATEGY_ROUTES, ...runRoutes([run])],
    });
    expect((await screen.findByRole('alert')).textContent).toContain('Não há velas');
  });

  test('a run of someone else (404) says so without a stack trace', async () => {
    renderApp({
      path: '/backtests/run-x',
      isAuthenticated: true,
      routes: [
        ...STRATEGY_ROUTES,
        {
          method: 'GET',
          path: '/v1/runs/run-x',
          respond: (): Response => errorResponse(404, 'RUN_NOT_FOUND'),
        },
      ],
    });
    expect((await screen.findByRole('alert')).textContent).toContain('não encontrada');
  });
});

describe('walk-forward detail', () => {
  const overfitting = {
    isAlert: true,
    reasons: ['sharpe_below_half_of_in_sample'],
    inSampleSharpe: metricValue('2.0'),
    outOfSampleSharpe: metricValue('0.4'),
    degradation: metricValue('0.2'),
    eligibleWindows: 3,
    totalWindows: 4,
  };

  test('shows the out-of-sample report first and the overfitting alert in words', async () => {
    const run = buildRun({ id: 'run-wf', kind: 'walk_forward', overfitting });
    renderApp({
      path: '/backtests/run-wf',
      isAuthenticated: true,
      routes: [
        ...STRATEGY_ROUTES,
        ...runRoutes([run]),
        {
          method: 'GET',
          path: '/v1/runs/run-wf/windows',
          respond: (): Response =>
            pageResponse([
              {
                windowIndex: 0,
                testStart: 1_767_225_600_000,
                testEnd: 1_769_904_000_000,
                status: 'ok',
                eligibleCombinations: 12,
              },
            ]),
        },
      ],
    });
    const report = await screen.findByRole('region', { name: 'Resultado fora da amostra' });
    expect(report.textContent).toContain('+4,20%');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Alerta de sobreajuste');
    expect(alert.textContent).toContain('metade');
    expect((await screen.findByRole('region', { name: 'Janelas' })).textContent).toContain('12');
  });

  test('a finished walk-forward carries the same "history is not a promise" notice', async () => {
    const run = buildRun({ id: 'run-wf', kind: 'walk_forward', overfitting });
    renderApp({
      path: '/backtests/run-wf',
      isAuthenticated: true,
      routes: [
        ...STRATEGY_ROUTES,
        ...runRoutes([run]),
        {
          method: 'GET',
          path: '/v1/runs/run-wf/windows',
          respond: (): Response => pageResponse([]),
        },
      ],
    });
    const note = await screen.findByRole('note', { name: 'Leia com cuidado' });
    expect(note.textContent).toContain('não promete');
  });

  test('without alert it says the out-of-sample result held up', async () => {
    const run = buildRun({
      id: 'run-wf',
      kind: 'walk_forward',
      overfitting: { ...overfitting, isAlert: false, reasons: [] },
    });
    renderApp({
      path: '/backtests/run-wf',
      isAuthenticated: true,
      routes: [
        ...STRATEGY_ROUTES,
        ...runRoutes([run]),
        {
          method: 'GET',
          path: '/v1/runs/run-wf/windows',
          respond: (): Response => pageResponse([]),
        },
      ],
    });
    expect(await screen.findByText(/Sem sinal de sobreajuste/)).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('comparison', () => {
  const first = buildRun({ id: 'run-a', strategyVersionId: 'version-1' });
  const second = buildRun({
    id: 'run-b',
    strategyVersionId: 'version-2',
    metrics: buildMetrics({
      totalReturn: metricValue('0.08'),
      feesPaid: '150.00',
      trades: 40,
    }),
  });

  test('puts buy and hold and the two runs side by side', async () => {
    renderApp({
      path: '/backtests/comparar?a=run-a&b=run-b',
      isAuthenticated: true,
      routes: [...STRATEGY_ROUTES, ...runRoutes([first, second])],
    });
    const table = await screen.findByRole('table', { name: 'Comparação de execuções' });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers.join('|')).toContain('Comprar e segurar');
    expect(headers.join('|')).toContain('versão 1');
    expect(headers.join('|')).toContain('versão 2');
    const returnRow = within(table).getByRole('row', { name: /Retorno total/ });
    expect(returnRow.textContent).toContain('+1,10%');
    expect(returnRow.textContent).toContain('+4,20%');
    expect(returnRow.textContent).toContain('+8,00%');
  });

  test('explains the costs honestly and shows the fees each side paid', async () => {
    renderApp({
      path: '/backtests/comparar?a=run-a&b=run-b',
      isAuthenticated: true,
      routes: [...STRATEGY_ROUTES, ...runRoutes([first, second])],
    });
    const costs = await screen.findByRole('region', { name: 'Como ler os custos' });
    expect(costs.textContent).toContain('uma compra e uma venda');
    expect(costs.textContent).toContain('85,30');
    expect(costs.textContent).toContain('150,00');
    expect(costs.textContent).toContain('não é recomendação');
  });

  test('warns when the two runs are not about the same pair and period', async () => {
    const other = buildRun({ id: 'run-b', symbol: 'ETHUSDT' });
    renderApp({
      path: '/backtests/comparar?a=run-a&b=run-b',
      isAuthenticated: true,
      routes: [...STRATEGY_ROUTES, ...runRoutes([first, other])],
    });
    expect((await screen.findByRole('alert')).textContent).toContain('par');
  });

  test('without two valid runs it asks to pick them', async () => {
    renderApp({
      path: '/backtests/comparar?a=run-a',
      isAuthenticated: true,
      routes: [...STRATEGY_ROUTES, ...runRoutes([first])],
    });
    expect(await screen.findByText(/Escolha duas execuções/)).toBeDefined();
  });
});
