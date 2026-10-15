// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, setSystemTime, test } from 'bun:test';

import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';

import { STREAM_STATUS } from '../src/live/stream.constant.js';
import type { StreamCandle } from '../src/live/stream.validation.js';
import { dataResponse, errorResponse } from './support/fake-fetch.js';
import {
  showCandleCard,
  type CandleCardHarness,
  type CandleCardOptions,
} from './support/candle-card-harness.js';
import {
  buildProjectionItem,
  buildProjectionsResponse,
  FIRST_CANDLE_TIME,
  HOUR_MILLISECONDS,
} from './support/candle-chart-fixtures.js';

const DECISION_AT = FIRST_CANDLE_TIME + 2 * HOUR_MILLISECONDS;
const FIFTEEN_MINUTES_BEFORE = DECISION_AT - 15 * 60_000;

// A previsão do fixture vale até DECISION_AT: o relógio padrão dos testes fica dentro do horizonte (fora dele ela é velha).
beforeEach(() => {
  setSystemTime(new Date(FIFTEEN_MINUTES_BEFORE));
});

afterEach(() => {
  setSystemTime();
  cleanup();
  localStorage.clear();
});

function current(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return Object.assign({}, buildProjectionsResponse()['current'], overrides);
}

function unavailable(reason: string, message: string): Record<string, unknown> {
  return { status: 'unavailable', reason, message };
}

function openPanel(
  response: Record<string, unknown> = buildProjectionsResponse(),
  options: CandleCardOptions = {},
): CandleCardHarness {
  return showCandleCard({
    kind: 'live_paper',
    respondProjections: () => dataResponse(response),
    ...options,
  });
}

function formingCandle(overrides: Partial<StreamCandle> = {}): StreamCandle {
  return {
    type: 'candle',
    symbol: 'BNBUSDT',
    timeframe: '1h',
    openTime: DECISION_AT - HOUR_MILLISECONDS,
    open: '12.93',
    high: '12.985',
    low: '12.872',
    close: '12.905',
    volume: '23900.5',
    closed: false,
    at: Date.now(),
    ...overrides,
  };
}

function panel(): HTMLElement {
  return screen.getByRole('complementary', { name: 'Próxima vela de perto' });
}

async function ready(harness: CandleCardHarness): Promise<void> {
  act(() => harness.app.stream.setStatus(STREAM_STATUS.LIVE));
  await screen.findByRole('complementary', { name: 'Próxima vela de perto' });
}

describe('painel "Próxima vela de perto" com tendência', () => {
  test('a buy trend says the words, the placar and the typical band, all from the server', async () => {
    setSystemTime(new Date(FIFTEEN_MINUTES_BEFORE));
    const harness = openPanel();
    await ready(harness);
    await within(panel()).findByText('Tende a COMPRAR · fraco');
    const text = panel().textContent ?? '';
    expect(text).toContain('Próximos 15 min (até a decisão das 05:00)');
    expect(text).toContain('Placar +1 de +2 para comprar.');
    expect(text).toContain('Faixa típica: 12,778 a 13,032.');
    expect(text).toContain('Tendência, não promessa.');
    expect(text).toContain('O preço pode ir para o outro lado.');
    expect(panel().querySelector('[data-part="cone"]')).not.toBeNull();
    const drawing = within(panel()).getByRole('img');
    expect(drawing.getAttribute('aria-label')).toBe(
      'Últimas velas e a faixa da próxima vela. Tende a COMPRAR · fraco. Faixa de 12,778 a 13,032.',
    );
  });

  test('a sell trend uses the sell words and the down arrow', async () => {
    const response = buildProjectionsResponse({
      current: current({
        side: 'sell',
        stance: 'sell',
        strength: 'strong',
        score: '-1.5',
        threshold: '-2',
        label: 'Tende a VENDER · forte',
        message: 'Placar −1,5 de −2 para vender.',
      }),
    });
    const harness = openPanel(response);
    await ready(harness);
    await within(panel()).findByText('Tende a VENDER · forte');
    expect(panel().textContent).toContain('Placar −1,5 de −2 para vender.');
    expect(panel().textContent).toContain('↘ vender');
    expect(panel().querySelector('[data-part="cone"]')).not.toBeNull();
  });
});

describe('painel sem previsão (RF16)', () => {
  const reasons: readonly (readonly [string, string])[] = [
    ['neutral', 'O placar está em 0: nenhuma regra puxa para um lado.'],
    ['warming_up', 'A estratégia ainda está juntando velas para calcular as regras.'],
    ['no_candle', 'Aguardando a primeira vela fechar.'],
    ['not_running', 'A simulação não está rodando: não há próxima decisão.'],
  ];

  for (const [reason, message] of reasons) {
    test(`${reason}: the sentence is the server one and no band is drawn`, async () => {
      const response = buildProjectionsResponse({ current: unavailable(reason, message) });
      const harness = openPanel(response);
      await ready(harness);
      await within(panel()).findByText(message);
      expect(within(panel()).getByText('Sem previsão agora')).toBeDefined();
      expect(panel().querySelector('[data-part="cone"]')).toBeNull();
      expect(panel().textContent).not.toContain('Tende a');
      expect(panel().textContent).not.toContain('Faixa típica');
    });
  }

  test('another candle on the chart says why, with the literal sentence, and draws nothing', async () => {
    const harness = openPanel();
    await ready(harness);
    await within(panel()).findByText('Tende a COMPRAR · fraco');
    fireEvent.click(screen.getByRole('button', { name: /^4h/ }));
    await within(panel()).findByText(
      'A estratégia decide em velas de 1 h; troque para 1h para ver a previsão.',
    );
    expect(panel().querySelector('[data-part="cone"]')).toBeNull();
    expect(within(panel()).queryByRole('img')).toBeNull();
  });

  test('a forecast past its horizon with no newer one says it is old and draws no cone', async () => {
    setSystemTime(new Date(DECISION_AT + 3 * 60_000));
    const harness = openPanel();
    await ready(harness);
    await within(panel()).findByText(
      'A previsão ficou velha: a vela que ela previa já fechou e a nova ainda não chegou.',
    );
    expect(panel().querySelector('[data-part="cone"]')).toBeNull();
  });

  test('a stopped price replaces the trend with the sentence and a warning word', async () => {
    const harness = openPanel(undefined, { silenceMilliseconds: 50 });
    await ready(harness);
    await within(panel()).findByText('Tende a COMPRAR · fraco');
    setSystemTime(); // o relógio congelado não deixaria o silêncio passar
    act(() => harness.app.stream.candle(formingCandle()));
    expect(
      await within(panel()).findByText(
        'O preço ao vivo parou de chegar; a previsão volta quando ele voltar.',
        undefined,
        { timeout: 3_500 },
      ),
    ).toBeDefined();
    expect(within(panel()).getByText('Sem previsão agora')).toBeDefined();
    expect(panel().querySelector('[data-part="cone"]')).toBeNull();
  });

  test('a failed request keeps the chart and says so in one sentence', async () => {
    const harness = showCandleCard({
      kind: 'live_paper',
      respondProjections: () => errorResponse(500, 'INTERNAL'),
    });
    await ready(harness);
    expect(
      await within(panel()).findByText(
        'Não foi possível carregar a previsão; o gráfico e as operações continuam.',
      ),
    ).toBeDefined();
    expect(harness.surfaces.some((surface) => !surface.isDestroyed())).toBe(true);
  });
});

describe('painel: preço real e resultado', () => {
  test('the real line only appears when the forming candle arrives, with the "agora" marker', async () => {
    const harness = openPanel();
    await ready(harness);
    await within(panel()).findByText('Tende a COMPRAR · fraco');
    expect(panel().querySelector('[data-part="real-line"]')).toBeNull();
    act(() => harness.app.stream.candle(formingCandle({ close: '12.95' })));
    await waitFor(() => expect(panel().querySelector('[data-part="real-line"]')).not.toBeNull());
    expect(within(panel()).getByText('agora')).toBeDefined();
    expect(panel().querySelector('[data-part="forming"]')).not.toBeNull();
    expect(panel().textContent).toContain('preço agora 12,95');
  });

  test('when the candle closes the result of the previous prediction appears', async () => {
    const missed = buildProjectionItem({
      result: 'miss',
      moveRate: '-0.0027',
      nextClose: '12.87',
      isInside: true,
    });
    const harness = openPanel(buildProjectionsResponse({ items: [buildProjectionItem(), missed] }));
    await ready(harness);
    expect(
      await within(panel()).findByText('Errou: o preço caiu 0,27% — ficou dentro da faixa.'),
    ).toBeDefined();
  });

  test('a hit says "Acertou" and a pending prediction shows no result', async () => {
    const hit = buildProjectionItem({
      result: 'hit',
      moveRate: '0.0103',
      nextClose: '13.04',
      isInside: false,
    });
    const harness = openPanel(buildProjectionsResponse({ items: [hit] }));
    await ready(harness);
    expect(
      await within(panel()).findByText('Acertou: o preço subiu 1,03% — ficou fora da faixa.'),
    ).toBeDefined();
    cleanup();
    const pending = openPanel(buildProjectionsResponse({ items: [buildProjectionItem()] }));
    await ready(pending);
    await within(panel()).findByText('Tende a COMPRAR · fraco');
    expect(panel().textContent).not.toContain('Acertou');
    expect(panel().textContent).not.toContain('Errou');
  });
});

describe('quando o painel existe', () => {
  test('a backtest has no panel and never asks for the trend', async () => {
    const harness = showCandleCard({
      respondProjections: () => dataResponse(buildProjectionsResponse()),
    });
    act(() => harness.app.stream.setStatus(STREAM_STATUS.LIVE));
    await waitFor(() => expect(harness.surfaces.length).toBeGreaterThan(0));
    expect(screen.queryByRole('complementary', { name: 'Próxima vela de perto' })).toBeNull();
  });

  test('turning the "Previsão" layer off takes the panel away', async () => {
    const harness = openPanel();
    await ready(harness);
    fireEvent.click(screen.getByRole('button', { name: 'Previsão' }));
    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: 'Próxima vela de perto' })).toBeNull(),
    );
  });
});
