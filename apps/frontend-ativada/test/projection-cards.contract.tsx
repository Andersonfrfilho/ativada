// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, fireEvent, screen, within } from '@testing-library/react';

import { ProjectionCards } from '../src/runs/projection-cards/ProjectionCards.component.js';
import {
  buildProjectionItem,
  buildProjectionsResponse,
  buildProjectionsSummary,
} from './support/candle-chart-fixtures.js';
import { dataResponse, errorResponse, type FakeRoute } from './support/fake-fetch.js';
import { buildLiveStatusResponse } from './support/live-status-fixtures.js';
import { renderApp, type RenderedApp } from './support/render-app.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const BASE = '/v1/runs/run-1';

function macdRule(): Record<string, unknown> {
  return {
    ruleId: 'macd',
    label: 'MACD',
    kind: 'macd',
    vote: 1,
    weight: '1',
    isMet: true,
    metric: 'macd_gap',
    direction: 'above',
    basis: 'exact',
    current: '0.2',
    threshold: '0',
    distance: '0',
    distanceRate: null,
    message: 'já atendida',
  };
}

function liveStatus(rules: readonly unknown[] = [macdRule()]): Record<string, unknown> {
  const base = buildLiveStatusResponse();
  const triggers = Object.assign({}, base['triggers'], { rules });
  return buildLiveStatusResponse({ triggers });
}

type CardOptions = {
  readonly isLive?: boolean;
  readonly projections?: (cursor: string | null) => Response;
  readonly live?: () => Response;
};

function showCards(options: CardOptions = {}): RenderedApp {
  const routes: FakeRoute[] = [
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
    {
      method: 'GET',
      path: `${BASE}/projections`,
      respond: (call): Response =>
        options.projections?.(call.query.get('cursor')) ?? dataResponse(buildProjectionsResponse()),
    },
    {
      method: 'GET',
      path: `${BASE}/live-status`,
      respond: (): Response => options.live?.() ?? dataResponse(liveStatus()),
    },
  ];
  return renderApp({
    path: '/',
    isAuthenticated: true,
    routes,
    probe: <ProjectionCards runId="run-1" isLive={options.isLive ?? true} />,
  });
}

function card(name: string): HTMLElement {
  return screen.getByRole('region', { name });
}

describe('cartão "Histórico de acertos"', () => {
  test('shows the hit rate beside the coin flip, the server sentence and the verdict', async () => {
    showCards({ isLive: false });
    const history = await screen.findByRole('region', { name: 'Histórico de acertos' });
    await within(history).findByText('Acertou o lado em 49,42% (171 de 346).');
    const text = history.textContent ?? '';
    expect(text).toContain('49,42%');
    expect(text).toContain('171 de 346 previsões');
    expect(text).toContain('Moeda ao ar');
    expect(text).toContain('50,00%');
    expect(text).toContain('"sempre sobe": 50,58%');
    expect(text).toContain('Dentro da faixa');
    expect(text).toContain('90,85%');
    expect(text).toContain('318 de 350 velas');
    expect(within(history).getByText('Igual à moeda ao ar')).toBeDefined();
    expect(
      within(history).getByText(
        'Até aqui, a tendência acertou o lado tanto quanto uma moeda ao ar.',
      ),
    ).toBeDefined();
    expect(text).toContain('entre 44,20% e 54,67%');
  });

  test('numbers come from the server: a rate that does not match the counts is shown as sent', async () => {
    const summary = buildProjectionsSummary({
      hits: 1,
      counted: 100,
      hitRate: '0.1234',
      upRate: '0.9',
      insideRate: '0.0001',
    });
    showCards({
      isLive: false,
      projections: () => dataResponse(buildProjectionsResponse({ summary })),
    });
    const history = await screen.findByRole('region', { name: 'Histórico de acertos' });
    await within(history).findByText('12,34%');
    expect(history.textContent).toContain('1 de 100 previsões');
    expect(history.textContent).toContain('"sempre sobe": 90,00%');
    expect(history.textContent).toContain('0,01%');
  });

  const verdicts: readonly (readonly [string, string, string])[] = [
    [
      'above',
      'Acima da moeda ao ar',
      'Até aqui, a tendência acertou o lado mais vezes que uma moeda ao ar.',
    ],
    [
      'below',
      'Abaixo da moeda ao ar',
      'Até aqui, a tendência errou o lado mais vezes que uma moeda ao ar.',
    ],
    [
      'too_few',
      'Poucas previsões',
      'Ainda há poucas previsões para dizer se acerta mais que o acaso.',
    ],
  ];

  for (const [verdict, word, sentence] of verdicts) {
    test(`the ${verdict} verdict is a word, an icon and the server sentence`, async () => {
      const summary = buildProjectionsSummary({ verdict, verdictMessage: sentence });
      showCards({
        isLive: false,
        projections: () => dataResponse(buildProjectionsResponse({ summary })),
      });
      const history = await screen.findByRole('region', { name: 'Histórico de acertos' });
      await within(history).findByText(word);
      expect(within(history).getByText(sentence)).toBeDefined();
      expect(history.textContent?.includes('95% de confiança') ?? false).toBe(
        verdict !== 'too_few',
      );
    });
  }

  test('below 30 counted predictions the card says there are few', async () => {
    const summary = buildProjectionsSummary({
      counted: 29,
      hits: 20,
      hitRate: '0.6896',
      verdict: 'too_few',
      verdictMessage: 'Ainda há poucas previsões para dizer se acerta mais que o acaso.',
      message: 'Acertou o lado em 68,96% (20 de 29).',
    });
    showCards({
      isLive: false,
      projections: () => dataResponse(buildProjectionsResponse({ summary })),
    });
    const history = await screen.findByRole('region', { name: 'Histórico de acertos' });
    await within(history).findByText('Poucas previsões');
    expect(history.textContent).toContain(
      'Ainda há poucas previsões para dizer se acerta mais que o acaso.',
    );
    expect(history.textContent).not.toContain('Acima da moeda ao ar');
  });

  test('the strength bars carry the 50% mark and the same numbers in words', async () => {
    showCards({ isLive: false });
    const list = await screen.findByRole('list', { name: 'Acerto por força do placar' });
    expect(within(list).getByText('Fraco')).toBeDefined();
    expect(list.textContent).toContain('49,00% · 200 previsões');
    const fill = list.querySelector('rect:nth-of-type(2)');
    expect(fill?.getAttribute('width')).toBe('49.00000000');
    expect(list.querySelector('line')?.getAttribute('x1')).toBe('50');
  });

  test('the table lists the predictions with side, strength, start, price after and result', async () => {
    const items = [
      buildProjectionItem({ result: 'pending' }),
      buildProjectionItem({
        candleTime: 1_000,
        closedAt: 1_784_000_000_000,
        side: 'sell',
        strength: 'strong',
        base: '12.90500000',
        nextClose: '12.87000000',
        moveRate: '-0.0027',
        result: 'hit',
        isInside: true,
      }),
      buildProjectionItem({ candleTime: 2_000, side: 'none', strength: null, result: 'no_side' }),
    ];
    showCards({
      isLive: false,
      projections: () => dataResponse(buildProjectionsResponse({ items })),
    });
    const table = await screen.findByRole('table');
    expect(within(table).getByRole('columnheader', { name: '1 h depois' })).toBeDefined();
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain('Comprar · fraco');
    expect(rows[0]?.textContent).toContain('Aguardando');
    expect(rows[1]?.textContent).toContain('Vender · forte');
    expect(rows[1]?.textContent).toContain('12,905');
    expect(rows[1]?.textContent).toContain('12,87');
    expect(rows[1]?.textContent).toContain('Acertou');
    expect(rows[1]?.textContent).toContain('na faixa');
    expect(rows[2]?.textContent).toContain('Sem lado');
    expect(rows[2]?.textContent).toContain('Sem aposta');
  });

  test('"Ver mais" asks the next page by cursor and shows it below', async () => {
    const cursors: (string | null)[] = [];
    showCards({
      isLive: false,
      projections: (cursor) => {
        cursors.push(cursor);
        if (cursor === 'c2') {
          const older = buildProjectionItem({
            candleTime: 5_000,
            closedAt: 1_784_000_100_000,
            result: 'miss',
            moveRate: '0.001',
            isInside: false,
          });
          return dataResponse(buildProjectionsResponse({ items: [older], nextCursor: null }));
        }
        return dataResponse(buildProjectionsResponse({ nextCursor: 'c2' }));
      },
    });
    const more = await screen.findByRole('button', { name: 'Ver mais previsões' });
    fireEvent.click(more);
    expect(await screen.findByText('Errou')).toBeDefined();
    expect(cursors).toContain('c2');
    expect(screen.queryByRole('button', { name: 'Ver mais previsões' })).toBeNull();
  });

  test('a failed request says so, and an empty history says there is nothing yet', async () => {
    showCards({ isLive: false, projections: () => errorResponse(500, 'INTERNAL') });
    expect(
      await screen.findByText('Não foi possível carregar o histórico de acertos.'),
    ).toBeDefined();
    cleanup();
    showCards({
      isLive: false,
      projections: () => dataResponse(buildProjectionsResponse({ items: [] })),
    });
    expect(await screen.findByText('Ainda não há previsões com resultado.')).toBeDefined();
  });

  test('a backtest has only the history card', async () => {
    showCards({ isLive: false });
    await screen.findByRole('region', { name: 'Histórico de acertos' });
    expect(screen.queryByRole('region', { name: 'De onde vem a previsão' })).toBeNull();
  });
});

describe('cartão "De onde vem a previsão"', () => {
  test('shows the placar ruler, each vote in words, what is missing and the band in words', async () => {
    showCards();
    const source = await screen.findByRole('region', { name: 'De onde vem a previsão' });
    await within(source).findByText(/o placar da própria estratégia na vela que fechou às 04:00/);
    expect(
      within(source).getByRole('img', { name: /Pontuação 1; compra a partir de \+2/ }),
    ).toBeDefined();
    const votes = within(source).getByRole('list', { name: 'Voto de cada regra' });
    expect(votes.textContent).toContain('MACD:');
    expect(votes.textContent).toContain('+1 a favor');
    expect(source.textContent).toContain('O que falta: Faltam 1 ponto de 2 para comprar.');
    expect(source.textContent).toContain(
      'numa vela de 1 h o BTC/USDT costuma andar até 0,127 USDT. Por isso a faixa vai de 12,778 a 13,032.',
    );
    expect(source.textContent).toContain('Tendência, não promessa.');
    expect(source.textContent).toContain(
      '"Fraco" quer dizer que só metade do caminho até a compra foi andado.',
    );
  });

  test('without a trend the card repeats the server reason and draws no band', async () => {
    const unavailable = {
      status: 'unavailable',
      reason: 'neutral',
      message: 'O placar está em 0: nenhuma regra puxa para um lado.',
    };
    showCards({
      projections: () => dataResponse(buildProjectionsResponse({ current: unavailable })),
    });
    const source = await screen.findByRole('region', { name: 'De onde vem a previsão' });
    await within(source).findByText('O placar está em 0: nenhuma regra puxa para um lado.');
    expect(source.textContent).not.toContain('costuma andar até');
  });

  test('the weak note names the side the placar pulls to', async () => {
    const sell = buildProjectionsResponse();
    const current = Object.assign({}, sell['current'], { side: 'sell', stance: 'sell' });
    showCards({ projections: () => dataResponse(buildProjectionsResponse({ current })) });
    const source = await screen.findByRole('region', { name: 'De onde vem a previsão' });
    await within(source).findByText(/só metade do caminho até a venda foi andado/);
  });

  test('the ruler and the votes stay when only the projections fail', async () => {
    showCards({ projections: () => errorResponse(503, 'UNAVAILABLE') });
    const source = await screen.findByRole('region', { name: 'De onde vem a previsão' });
    await within(source).findByText(
      'Não foi possível carregar a faixa e o lado da previsão agora.',
    );
    expect(within(source).getByRole('list', { name: 'Voto de cada regra' })).toBeDefined();
    expect(within(source).getByRole('img', { name: /Pontuação 1/ })).toBeDefined();
    expect(source.textContent).toContain('só metade do caminho até a compra ou a venda');
  });

  test('a failed live status says so without hiding the history card', async () => {
    showCards({ live: () => errorResponse(503, 'UNAVAILABLE') });
    expect(
      await screen.findByText('Não foi possível carregar de onde vem a previsão.'),
    ).toBeDefined();
    expect(card('Histórico de acertos')).toBeDefined();
  });
});
