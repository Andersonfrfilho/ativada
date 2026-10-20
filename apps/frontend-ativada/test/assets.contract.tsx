// Copyright (c) 2026 Ada Technology. All rights reserved.
import { beforeEach, describe, expect, test } from 'bun:test';

import { HTTP_STATUS } from '@ativada/environment';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';

import { dataResponse, errorResponse, pageResponse, type FakeRoute } from './support/fake-fetch.js';
import { buildAssetItem, buildSummary } from './support/asset-fixtures.js';
import { renderApp } from './support/render-app.js';

const NOW = Date.parse('2026-10-11T12:00:00.000Z');

type World = { summary: Record<string, unknown> };

function routes(world: World, extra: readonly FakeRoute[] = []): readonly FakeRoute[] {
  return [
    ...extra,
    {
      method: 'GET',
      path: '/v1/assets/summary',
      respond: (): Response => dataResponse(world.summary),
    },
    {
      method: 'GET',
      path: '/v1/strategies',
      respond: (): Response =>
        pageResponse([
          {
            id: 'strategy-1',
            name: 'Placar clássico',
            isExample: true,
            createdAt: '2026-10-01T00:00:00Z',
            updatedAt: '2026-10-01T00:00:00Z',
          },
          {
            id: 'strategy-2',
            name: 'Minha regra',
            isExample: false,
            createdAt: '2026-10-02T00:00:00Z',
            updatedAt: '2026-10-02T00:00:00Z',
          },
        ]),
    },
  ];
}

function tick(price: string): {
  symbol: string;
  price: string;
  change24h: string | null;
  at: number;
  isStale: boolean;
} {
  return { symbol: 'BTCUSDT', price, change24h: null, at: NOW, isStale: false };
}

async function openAssets(
  world: World,
  extra: readonly FakeRoute[] = [],
): Promise<ReturnType<typeof renderApp>> {
  const rendered = renderApp({
    path: '/ativos',
    isAuthenticated: true,
    routes: routes(world, extra),
  });
  await screen.findByRole('heading', { name: 'Seus ativos' });
  return rendered;
}

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // happy-dom sem storage: o teste segue sem cotação guardada.
  }
});

describe('assets board', () => {
  test('shows quantity, weighted average price, value in USDT, result, day rule, target and stop', async () => {
    await openAssets({ summary: buildSummary([buildAssetItem()]) });
    const card = await screen.findByRole('article', { name: 'BTC/USDT' });
    expect(card.textContent).toContain('Quantidade 0,5');
    expect(card.textContent).toContain('Preço médio 60.000,00');
    expect(card.textContent).toContain('31.000,00 USDT');
    expect(card.textContent).toContain('+1.000,00');
    expect(card.textContent).toContain('+3,33%');
    expect(card.textContent).toContain('Segurar');
    expect(card.textContent).toContain('Alvo 66.000,00');
    expect(card.textContent).toContain('Stop 55.200,00');
    expect(screen.getByText(/Total: 31.000,00 USDT/)).toBeDefined();
  });

  test('says sell and wait in words, and flags a reached target or stop', async () => {
    const sell = buildAssetItem({
      rule: { ...(buildAssetItem()['rule'] as object), action: 'sell' },
      isTargetReached: true,
    });
    const wait = buildAssetItem({
      symbol: 'ETHUSDT',
      rule: { ...(buildAssetItem()['rule'] as object), action: 'wait' },
      isStopReached: true,
    });
    await openAssets({ summary: buildSummary([sell, wait]) });
    const bitcoin = await screen.findByRole('article', { name: 'BTC/USDT' });
    expect(bitcoin.textContent).toContain('Vender');
    expect(bitcoin.textContent).toContain('Alvo atingido');
    const ether = screen.getByRole('article', { name: 'ETH/USDT' });
    expect(ether.textContent).toContain('Aguardar');
    expect(ether.textContent).toContain('Stop atingido');
  });

  test('an empty board invites the first record', async () => {
    await openAssets({ summary: buildSummary([]) });
    expect(await screen.findByText(/Nenhum ativo registrado/)).toBeDefined();
  });

  test('without a live USDT/BRL rate, converts to reais with the rate the user typed', async () => {
    await openAssets({ summary: buildSummary([buildAssetItem()]) });
    const card = await screen.findByRole('article', { name: 'BTC/USDT' });
    expect(card.textContent).not.toContain('R$');
    expect(screen.getByText(/cotação ao vivo do USDT\/BRL/)).toBeDefined();
    fireEvent.change(screen.getByLabelText('Cotação do USDT em R$'), { target: { value: '5,5' } });
    await waitFor(() => expect(card.textContent).toContain('R$ 170.500,00'));
    expect(screen.getByText(/Total em R\$: R\$ 170\.500,00/)).toBeDefined();
  });

  test('the live USDT/BRL rate wins over the typed one, and the typed one is back when it goes quiet', async () => {
    const { stream } = await openAssets({ summary: buildSummary([buildAssetItem()]) });
    const card = await screen.findByRole('article', { name: 'BTC/USDT' });
    fireEvent.change(screen.getByLabelText('Cotação do USDT em R$'), { target: { value: '5,5' } });
    await waitFor(() => expect(card.textContent).toContain('R$ 170.500,00'));
    act(() => stream.setStatus('live'));
    act(() => stream.tick({ ...tick('6'), symbol: 'USDTBRL' }));
    await waitFor(() => expect(card.textContent).toContain('R$ 186.000,00'));
    expect(screen.getByText(/Total em R\$: R\$ 186\.000,00/)).toBeDefined();
    act(() => stream.tick({ ...tick('6'), symbol: 'USDTBRL', isStale: true }));
    await waitFor(() => expect(card.textContent).toContain('R$ 170.500,00'));
  });

  test('remembers the typed rate in this browser', async () => {
    await openAssets({ summary: buildSummary([buildAssetItem()]) });
    fireEvent.change(await screen.findByLabelText('Cotação do USDT em R$'), {
      target: { value: '5.5' },
    });
    expect(localStorage.getItem('ativada.usdt-brl-rate')).toBe('5.5');
  });

  test('a live tick recomputes the value without reloading', async () => {
    const { stream, fake } = await openAssets({ summary: buildSummary([buildAssetItem()]) });
    const card = await screen.findByRole('article', { name: 'BTC/USDT' });
    const calls = fake.callsTo('GET', '/v1/assets/summary').length;
    act(() => stream.setStatus('live'));
    act(() => stream.tick(tick('63000')));
    await waitFor(() => expect(card.textContent).toContain('31.500,00 USDT'));
    expect(card.textContent).toContain('+1.500,00');
    expect(fake.callsTo('GET', '/v1/assets/summary').length).toBe(calls);
  });

  test('a live tick above the target or below the stop flags it, a sealed (stale) tick is ignored', async () => {
    const { stream } = await openAssets({ summary: buildSummary([buildAssetItem()]) });
    const card = await screen.findByRole('article', { name: 'BTC/USDT' });
    act(() => stream.setStatus('live'));
    act(() => stream.tick(tick('67000')));
    await waitFor(() => expect(card.textContent).toContain('Alvo atingido'));
    act(() => stream.tick(tick('50000')));
    await waitFor(() => expect(card.textContent).toContain('Stop atingido'));
    expect(card.textContent).not.toContain('Alvo atingido');
    act(() => stream.tick({ ...tick('3000'), symbol: 'ETHUSDT' }));
    act(() => stream.tick({ ...tick('99000'), isStale: true }));
    await waitFor(() => expect(card.textContent).toContain('31.000,00 USDT'));
    expect(card.textContent).not.toContain('Alvo atingido');
  });

  test('the summary and the total in reais are rebuilt from the same live numbers, so they add up with the cards', async () => {
    const ether = buildAssetItem({
      symbol: 'ETHUSDT',
      quantity: '3.33333333',
      averagePrice: '3000',
      price: { value: '3100', at: 1, source: '15m' },
      value: '10333.33332300',
      cost: '9999.99999000',
      result: '333.33333300',
      resultRate: '0.03333333',
      targetPrice: '3300',
      stopPrice: '2760',
    });
    const { stream } = await openAssets({ summary: buildSummary([buildAssetItem(), ether]) });
    await screen.findByRole('article', { name: 'BTC/USDT' });
    fireEvent.change(screen.getByLabelText('Cotação do USDT em R$'), {
      target: { value: '5,555' },
    });
    act(() => stream.setStatus('live'));
    act(() => stream.tick(tick('63333.33')));
    act(() => stream.tick({ ...tick('3123.45'), symbol: 'ETHUSDT' }));
    const btc = screen.getByRole('article', { name: 'BTC/USDT' });
    const eth = screen.getByRole('article', { name: 'ETH/USDT' });
    await waitFor(() => expect(btc.textContent).toContain('31.666,67 USDT'));
    await waitFor(() => expect(eth.textContent).toContain('10.411,50 USDT'));
    const reais = (card: HTMLElement): number => {
      const match = /R\$ ([\d.]+,\d{2})/.exec(card.textContent ?? '');
      return Number((match?.[1] ?? '0').replace(/\./g, '').replace(',', '.'));
    };
    const total = /Total em R\$: R\$ ([\d.]+,\d{2})/.exec(document.body.textContent ?? '');
    const shown = Number((total?.[1] ?? '0').replace(/\./g, '').replace(',', '.'));
    expect(Math.round((reais(btc) + reais(eth)) * 100)).toBe(Math.round(shown * 100));
    expect(screen.getByText(/Total: 42\.078,16 USDT/)).toBeDefined();
  });

  test('big quantities keep every digit (no float in the money)', async () => {
    const big = buildAssetItem({
      quantity: '123456789.12345678',
      averagePrice: '1',
      price: { value: '1', at: 1, source: '15m' },
      value: '123456789.12345678',
      cost: '123456789.12345678',
      result: '0',
      resultRate: '0',
      targetPrice: '2',
      stopPrice: '0.5',
    });
    const { stream } = await openAssets({ summary: buildSummary([big]) });
    const card = await screen.findByRole('article', { name: 'BTC/USDT' });
    act(() => stream.setStatus('live'));
    act(() => stream.tick(tick('1.00000001')));
    await waitFor(() => expect(card.textContent).toContain('123.456.790,36 USDT'));
    expect(card.textContent).toContain('Quantidade 123.456.789,12345678');
  });

  test('with the socket down it polls the summary again on its own', async () => {
    const { stream, fake } = await openAssets({ summary: buildSummary([buildAssetItem()]) });
    await screen.findByRole('article', { name: 'BTC/USDT' });
    act(() => stream.setStatus('reconnecting'));
    const before = fake.callsTo('GET', '/v1/assets/summary').length;
    await waitFor(() =>
      expect(fake.callsTo('GET', '/v1/assets/summary').length).toBeGreaterThan(before + 1),
    );
  });

  test('asks the day rule with the first strategy on its own, and with the one picked afterwards', async () => {
    const { fake } = await openAssets({ summary: buildSummary([buildAssetItem()]) });
    const select = await screen.findByLabelText('Regra do dia pela estratégia');
    await waitFor(() =>
      expect(
        fake
          .callsTo('GET', '/v1/assets/summary')
          .some((call) => call.query.get('strategyId') === 'strategy-1'),
      ).toBe(true),
    );
    expect(
      fake
        .callsTo('GET', '/v1/assets/summary')
        .every((call) => call.query.get('strategyId') !== null),
    ).toBe(true);
    fireEvent.change(select, { target: { value: 'strategy-2' } });
    await waitFor(() =>
      expect(
        fake
          .callsTo('GET', '/v1/assets/summary')
          .some((call) => call.query.get('strategyId') === 'strategy-2'),
      ).toBe(true),
    );
  });
});

describe('registering operations', () => {
  test('buying sends side, quantity and the price paid, as text', async () => {
    const world: World = { summary: buildSummary([]) };
    const { fake } = await openAssets(world, [
      {
        method: 'PATCH',
        path: '/v1/assets/BTCUSDT',
        respond: (): Response => dataResponse({ symbol: 'BTCUSDT' }),
      },
    ]);
    fireEvent.change(await screen.findByLabelText('Quantidade'), { target: { value: '0.1' } });
    fireEvent.change(screen.getByLabelText('Preço pago'), { target: { value: '61000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(fake.callsTo('PATCH', '/v1/assets/BTCUSDT')).toHaveLength(1));
    expect(fake.callsTo('PATCH', '/v1/assets/BTCUSDT')[0]?.body).toEqual({
      side: 'buy',
      quantity: '0.1',
      price: '61000',
    });
  });

  test('selling needs only the quantity', async () => {
    const { fake } = await openAssets({ summary: buildSummary([buildAssetItem()]) }, [
      {
        method: 'PATCH',
        path: '/v1/assets/ETHUSDT',
        respond: (): Response => dataResponse({ symbol: 'ETHUSDT' }),
      },
    ]);
    fireEvent.change(await screen.findByLabelText('Operação'), { target: { value: 'sell' } });
    expect(screen.queryByLabelText('Preço pago')).toBeNull();
    fireEvent.change(screen.getByLabelText('Par'), { target: { value: 'ETHUSDT' } });
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() =>
      expect(fake.callsTo('PATCH', '/v1/assets/ETHUSDT')[0]?.body).toEqual({
        side: 'sell',
        quantity: '2',
      }),
    );
  });

  test('"Definir posição" replaces quantity and average price in one go', async () => {
    const { fake } = await openAssets({ summary: buildSummary([]) }, [
      {
        method: 'PUT',
        path: '/v1/assets/BTCUSDT',
        respond: (): Response => dataResponse({ symbol: 'BTCUSDT' }),
      },
    ]);
    fireEvent.change(await screen.findByLabelText('Operação'), { target: { value: 'replace' } });
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '1.5' } });
    fireEvent.change(screen.getByLabelText('Preço médio'), { target: { value: '59000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() =>
      expect(fake.callsTo('PUT', '/v1/assets/BTCUSDT')[0]?.body).toEqual({
        quantity: '1.5',
        averagePrice: '59000',
      }),
    );
  });

  test('bad numbers are stopped before the API, naming the fields', async () => {
    const { fake } = await openAssets({ summary: buildSummary([]) });
    fireEvent.change(await screen.findByLabelText('Quantidade'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Preço pago'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    const alertBox = await screen.findByRole('alert');
    expect(alertBox.textContent).toContain('Quantidade');
    expect(alertBox.textContent).toContain('Preço pago');
    expect(fake.callsTo('PATCH', '/v1/assets/BTCUSDT')).toHaveLength(0);
  });

  test('selling more than held is explained in words', async () => {
    await openAssets({ summary: buildSummary([]) }, [
      {
        method: 'PATCH',
        path: '/v1/assets/BTCUSDT',
        respond: (): Response => errorResponse(HTTP_STATUS.CONFLICT, 'ASSET_INSUFFICIENT_QUANTITY'),
      },
    ]);
    fireEvent.change(await screen.findByLabelText('Operação'), { target: { value: 'sell' } });
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    expect((await screen.findByRole('alert')).textContent).toContain('mais do que você tem');
  });

  test('deleting asks first and then calls the API', async () => {
    const { fake } = await openAssets({ summary: buildSummary([buildAssetItem()]) }, [
      {
        method: 'DELETE',
        path: '/v1/assets/BTCUSDT',
        respond: (): Response => new Response(null, { status: HTTP_STATUS.NO_CONTENT }),
      },
    ]);
    fireEvent.click(await screen.findByRole('button', { name: 'Apagar ativo BTC/USDT' }));
    expect(fake.callsTo('DELETE', '/v1/assets/BTCUSDT')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar: apagar ativo BTC/USDT' }));
    await waitFor(() => expect(fake.callsTo('DELETE', '/v1/assets/BTCUSDT')).toHaveLength(1));
  });
});
