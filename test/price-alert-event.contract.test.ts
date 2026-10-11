// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  PRICE_ALERT_EVENT_KIND,
  RUN_EVENTS_CHANNEL,
} from '../packages/database/src/run-events/run-event.constant.js';
import {
  parsePriceAlertEventPayload,
  parseRunEventPayload,
} from '../packages/database/src/run-events/run-event.schema.js';

const ALERT_ID = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d0e';

describe('aviso do disparo de um alerta de preço no canal run_events', () => {
  test('o canal é o mesmo dos passos ao vivo, e o tipo tem nome próprio', () => {
    expect(RUN_EVENTS_CHANNEL).toBe('run_events');
    expect(PRICE_ALERT_EVENT_KIND).toBe('price_alert');
  });

  test('aceita exatamente { kind, alertId }', () => {
    expect(
      parsePriceAlertEventPayload(JSON.stringify({ kind: 'price_alert', alertId: ALERT_ID })),
    ).toStrictEqual({ kind: 'price_alert', alertId: ALERT_ID });
  });

  test.each([
    ['vazio', ''],
    ['não é JSON', 'price_alert'],
    ['dono no aviso', JSON.stringify({ kind: 'price_alert', alertId: ALERT_ID, userId: ALERT_ID })],
    ['preço no aviso', JSON.stringify({ kind: 'price_alert', alertId: ALERT_ID, price: '1' })],
    ['id que não é UUID', JSON.stringify({ kind: 'price_alert', alertId: 'x' })],
    ['outro tipo', JSON.stringify({ kind: 'signal', alertId: ALERT_ID })],
  ])('recusa: %s', (_name, payload) => {
    expect(parsePriceAlertEventPayload(payload)).toBeUndefined();
  });

  test('o aviso de execução não vira aviso de alerta, e o de alerta não vira o de execução', () => {
    const runPayload = JSON.stringify({ runId: ALERT_ID, kind: 'signal', eventId: 'e1' });
    const alertPayload = JSON.stringify({ kind: 'price_alert', alertId: ALERT_ID });
    expect(parsePriceAlertEventPayload(runPayload)).toBeUndefined();
    expect(parseRunEventPayload(alertPayload)).toBeUndefined();
  });
});
