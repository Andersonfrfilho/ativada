// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';

import {
  computeNearDistance,
  formatNearDistance,
  nearProgress,
  stepNear,
} from '../src/notices/near-trigger.js';
import { dataResponse, pageResponse, type FakeRoute } from './support/fake-fetch.js';
import { buildDecisionResponse, buildLiveStatusResponse } from './support/live-status-fixtures.js';
import { createNoticeFeed } from './support/notice-fixtures.js';
import { renderApp } from './support/render-app.js';
import { buildRun } from './support/run-fixtures.js';

const RUN = 'run-near';

describe('perto de comprar: contas em BigInt (RF18)', () => {
  test('a distância até a regra de preço votar, para os dois lados', () => {
    // Regra "fechar abaixo de 12,400" com o preço ao vivo em 12,430: falta cair 0,24%.
    const below = computeNearDistance({ direction: 'below', threshold: '12.4', price: '12.43' });
    expect(below).toBeDefined();
    expect(formatNearDistance(below ?? 0n)).toBe('0,25');
    const above = computeNearDistance({ direction: 'above', threshold: '100', price: '99.8' });
    expect(formatNearDistance(above ?? 0n)).toBe('0,21');
  });

  test('preço já do lado atendido, zero ou lixo não têm distância', () => {
    expect(
      computeNearDistance({ direction: 'below', threshold: '12.4', price: '12.3' }),
    ).toBeUndefined();
    expect(
      computeNearDistance({ direction: 'below', threshold: '12.4', price: '12.4' }),
    ).toBeUndefined();
    expect(computeNearDistance({ direction: 'above', threshold: 'x', price: '1' })).toBeUndefined();
    expect(computeNearDistance({ direction: 'above', threshold: '1', price: '0' })).toBeUndefined();
  });

  test('histerese: entra a 0,3% ou menos e só sai além de 0,6%', () => {
    const at = (rate: bigint): bigint => rate;
    const NEAR = 300_000n;
    const FAR = 600_000n;
    expect(stepNear(false, at(NEAR))).toBe(true);
    expect(stepNear(false, at(NEAR + 1n))).toBe(false);
    expect(stepNear(true, at(FAR))).toBe(true);
    expect(stepNear(true, at(FAR + 1n))).toBe(false);
    expect(stepNear(true, undefined)).toBe(false);
  });

  test('a barra vai de 0 (borda da histerese) a 100 (em cima do limite), em inteiro', () => {
    expect(nearProgress(600_000n)).toBe(0n);
    expect(nearProgress(300_000n)).toBe(50n);
    expect(nearProgress(1n)).toBe(99n);
    expect(nearProgress(9_000_000n)).toBe(0n);
  });

  test('o módulo não usa Number em dinheiro', () => {
    const source = readFileSync(new URL('../src/notices/near-trigger.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/Number\(|parseFloat|parseInt/);
  });
});

function priceRule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ruleId: 'bollinger',
    label: 'Reversão',
    kind: 'bollinger',
    vote: 1,
    weight: '2',
    isMet: false,
    metric: 'close_price',
    direction: 'below',
    basis: 'exact',
    current: '100.3',
    threshold: '100',
    distance: '0.3',
    distanceRate: '0.003',
    message: 'Falta o preço cair.',
    completesScore: true,
    ...overrides,
  };
}

function nearRoutes(
  rules: readonly Record<string, unknown>[],
  candleTime = 1_767_225_600_000,
): FakeRoute[] {
  const status = buildLiveStatusResponse({
    run: {
      ...(buildLiveStatusResponse().run as Record<string, unknown>),
      id: RUN,
      nextDecisionAt: Date.parse('2026-10-16T20:15:00.000Z'),
    },
    triggers: {
      status: 'available',
      state: 'awaiting_entry',
      score: '1',
      scoreThreshold: '2',
      scoreGap: '1',
      message: 'Falta 1 ponto.',
      rules,
    },
    decisions: { items: [buildDecisionResponse({ candleTime })], nextCursor: null },
  });
  return [
    {
      method: 'GET',
      path: '/v1/runs',
      respond: () =>
        pageResponse([
          buildRun({ id: RUN, kind: 'live_paper', status: 'running', symbol: 'BTCUSDT' }),
        ]),
    },
    { method: 'GET', path: `/v1/runs/${RUN}/live-status`, respond: () => dataResponse(status) },
  ];
}

function tick(price: string): {
  symbol: string;
  price: string;
  change24h: string | null;
  at: number;
  isStale: boolean;
} {
  return { symbol: 'BTCUSDT', price, change24h: null, at: Date.now(), isStale: false };
}

async function mountMarked(
  rules: readonly Record<string, unknown>[],
): Promise<ReturnType<typeof renderApp>> {
  window.localStorage.setItem(
    'ativada.notices.anonymous',
    JSON.stringify({ earlyRunIds: [RUN], hasSeenCoach: true }),
  );
  const feed = createNoticeFeed();
  const app = renderApp({
    path: '/conta',
    isAuthenticated: true,
    routes: [...feed.route, ...nearRoutes(rules)],
    noticeToastMilliseconds: 60_000,
  });
  await screen.findByRole('button', { name: /^Avisos:/ });
  act(() => app.stream.setStatus('live'));
  return app;
}

describe('perto de comprar: só para a simulação marcada (D4-A)', () => {
  test('a 0,2% do limite aparece o aviso, com a barra e a frase honesta; some ao se afastar além de 0,6%', async () => {
    const app = await mountMarked([priceRule()]);
    await waitFor(() =>
      expect(app.fake.callsTo('GET', `/v1/runs/${RUN}/live-status`).length).toBeGreaterThan(0),
    );
    await Bun.sleep(80);
    act(() => app.stream.tick(tick('100.20')));
    const stack = await waitFor(() =>
      within(screen.getByRole('list', { name: 'Avisos recentes' })),
    );
    await stack.findByText('Perto do momento de comprar');
    expect(
      stack.getByText(
        /A regra "Reversão" vota comprar se a vela fechar abaixo de 100,00 \(fecha às \d\d:\d\d\)\. Agora: 100,20 — falta 0,20%\./,
      ),
    ).toBeDefined();
    expect(stack.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('66');
    expect(stack.getByText('Tendência, não promessa.')).toBeDefined();
    // 0,5% de distância: ainda dentro da histerese, continua.
    act(() => app.stream.tick(tick('100.50')));
    await Bun.sleep(40);
    expect(screen.queryByText('Perto do momento de comprar')).not.toBeNull();
    // 0,7%: além da histerese, some.
    act(() => app.stream.tick(tick('100.70')));
    await waitFor(() => expect(screen.queryByText('Perto do momento de comprar')).toBeNull());
  });

  test('a 0,5% de distância, sem ter estado perto antes, não avisa; fechar o aviso não o traz de volta na mesma vela', async () => {
    const app = await mountMarked([priceRule()]);
    await Bun.sleep(80);
    act(() => app.stream.tick(tick('100.50')));
    await Bun.sleep(60);
    expect(screen.queryByText('Perto do momento de comprar')).toBeNull();
    act(() => app.stream.tick(tick('100.20')));
    const closeButton = await screen.findByRole('button', { name: 'Fechar aviso' });
    fireEvent.click(closeButton);
    await waitFor(() => expect(screen.queryByText('Perto do momento de comprar')).toBeNull());
    act(() => app.stream.tick(tick('100.10')));
    await Bun.sleep(60);
    expect(screen.queryByText('Perto do momento de comprar')).toBeNull();
  });

  test('regra que não completa o placar, já atendida ou aproximada não gera aviso', async () => {
    const app = await mountMarked([
      priceRule({ ruleId: 'a', completesScore: false }),
      priceRule({ ruleId: 'b', isMet: true }),
      priceRule({ ruleId: 'c', basis: 'indicative' }),
      priceRule({ ruleId: 'd', metric: 'rsi' }),
    ]);
    await Bun.sleep(80);
    act(() => app.stream.tick(tick('100.10')));
    await Bun.sleep(80);
    expect(screen.queryByText('Perto do momento de comprar')).toBeNull();
  });

  test('simulação não marcada nunca avisa antes', async () => {
    window.localStorage.setItem(
      'ativada.notices.anonymous',
      JSON.stringify({ hasSeenCoach: true }),
    );
    const feed = createNoticeFeed();
    const app = renderApp({
      path: '/conta',
      isAuthenticated: true,
      routes: [...feed.route, ...nearRoutes([priceRule()])],
    });
    await screen.findByRole('button', { name: /^Avisos:/ });
    act(() => app.stream.setStatus('live'));
    await Bun.sleep(80);
    act(() => app.stream.tick(tick('100.10')));
    await Bun.sleep(80);
    expect(screen.queryByText('Perto do momento de comprar')).toBeNull();
    expect(app.fake.callsTo('GET', `/v1/runs/${RUN}/live-status`)).toHaveLength(0);
  });
});
