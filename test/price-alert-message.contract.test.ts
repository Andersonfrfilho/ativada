// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { loadAlertsApi } from './fixtures/telegram/alerts-api.fixture.js';
import { alertPayload } from './fixtures/telegram/alert-payload.fixture.js';
import {
  CHAT_OF_A,
  createDispatcherHarness,
  type DispatcherHarness,
} from './fixtures/telegram/dispatcher-harness.fixture.js';

const { formatPriceAlertMessage } = await loadAlertsApi();

type PricePayload = Parameters<typeof formatPriceAlertMessage>[0];

function pricePayload(overrides: Partial<PricePayload> = {}): PricePayload {
  return {
    symbol: 'BTCUSDT',
    direction: 'above',
    threshold: '70000.5',
    price: '70001.25',
    ...overrides,
  };
}

const DISCLAIMER = 'Aviso de preço configurado por você: não é recomendação de investimento.';

describe('texto do alerta de preço', () => {
  test('subiu acima: o par, o valor do usuário, o preço que cruzou e o aviso — texto exato', () => {
    expect(formatPriceAlertMessage(pricePayload())).toBe(
      [
        'Alerta de preço · BTCUSDT',
        'O preço subiu acima de 70000.5 (agora 70001.25).',
        DISCLAIMER,
      ].join('\n'),
    );
  });

  test('caiu abaixo', () => {
    expect(
      formatPriceAlertMessage(
        pricePayload({ direction: 'below', threshold: '65000', price: '64999.99' }),
      ),
    ).toBe(
      [
        'Alerta de preço · BTCUSDT',
        'O preço caiu abaixo de 65000 (agora 64999.99).',
        DISCLAIMER,
      ].join('\n'),
    );
  });

  test('o texto nunca promete nem recomenda', () => {
    for (const direction of ['above', 'below'] as const) {
      const text = formatPriceAlertMessage(pricePayload({ direction })).toLowerCase();
      expect(text).toContain('não é recomendação');
      expect(text).not.toContain('compre');
      expect(text).not.toContain('venda');
    }
  });
});

const open: DispatcherHarness[] = [];

function harness(): DispatcherHarness {
  const created = createDispatcherHarness();
  open.push(created);
  return created;
}

afterEach(async () => {
  for (const item of open.splice(0)) await item.stop();
});

describe('despacho do alerta de preço', () => {
  test('o aviso PRICE vai ao chat do dono com o texto do disparo, uma vez', async () => {
    const subject = harness();
    subject.enqueue({ side: 'PRICE', payload: pricePayload() });
    const summary = await subject.dispatcher.tick();
    await subject.dispatcher.tick();
    expect(summary).toMatchObject({ claimed: 1, sent: 1, failed: 0 });
    expect(subject.bot.requests).toHaveLength(1);
    expect(subject.bot.requests[0]?.body.chat_id).toBe(CHAT_OF_A);
    expect(subject.bot.requests[0]?.body.text).toBe(formatPriceAlertMessage(pricePayload()));
  });

  test('conteúdo de sinal sob o lado PRICE (e o inverso) não é enviado: falha com código estável', async () => {
    const subject = harness();
    subject.enqueue({ side: 'PRICE', payload: alertPayload() as never });
    subject.enqueue({ side: 'BUY', payload: pricePayload() });
    const summary = await subject.dispatcher.tick();
    expect(summary).toMatchObject({ claimed: 2, sent: 0, failed: 2 });
    expect(subject.alerts.rows.map((row) => row.lastError)).toStrictEqual([
      'bad_payload',
      'bad_payload',
    ]);
    expect(subject.bot.requests).toHaveLength(0);
  });

  test.each([
    ['preço que não é decimal', { price: 'abc' }],
    ['valor que não é decimal', { threshold: 'abc' }],
    ['direção fora do vocabulário', { direction: 'sideways' as never }],
    ['campo a mais (o chat, por exemplo)', { chat: '123' } as never],
  ])('conteúdo inválido não é enviado: %s', async (_name, overrides) => {
    const subject = harness();
    subject.enqueue({ side: 'PRICE', payload: pricePayload(overrides) });
    const summary = await subject.dispatcher.tick();
    expect(summary).toMatchObject({ claimed: 1, sent: 0, failed: 1 });
    expect(subject.bot.requests).toHaveLength(0);
  });
});
