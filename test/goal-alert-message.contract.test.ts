// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { loadAlertsApi } from './fixtures/telegram/alerts-api.fixture.js';
import { alertPayload } from './fixtures/telegram/alert-payload.fixture.js';
import {
  CHAT_OF_A,
  createDispatcherHarness,
  START_TIME,
  type DispatcherHarness,
} from './fixtures/telegram/dispatcher-harness.fixture.js';

const { formatGoalAlertMessage } = await loadAlertsApi();

type GoalPayload = Parameters<typeof formatGoalAlertMessage>[0];

function goalPayload(overrides: Partial<GoalPayload> = {}): GoalPayload {
  return {
    symbol: 'BTCUSDT',
    timeframe: '1d',
    outcome: 'goal_reached',
    targetRate: '0.03',
    maxLossRate: '0.05',
    horizonDays: 30,
    initialBalance: '10000',
    finalValue: '10312.45',
    resultRate: '0.031245',
    ...overrides,
  };
}

const CLOSING =
  'Qualquer posição aberta é vendida na abertura do próximo candle e a simulação termina.';
const DISCLAIMER =
  'Simulação: resultado de regra sobre o histórico, não é recomendação de investimento.';

describe('texto do alerta de desfecho da meta', () => {
  test('alvo atingido: título, resultado com sinal, meta, patrimônio e avisos — texto exato', () => {
    expect(formatGoalAlertMessage(goalPayload())).toBe(
      [
        'Meta atingida · BTCUSDT 1d',
        'A simulação chegou a +3,1% do saldo inicial.',
        'Meta: 3,0% em 30 dias, perda máxima de 5,0%.',
        'Patrimônio simulado: 10312.45 (saldo inicial 10000).',
        CLOSING,
        DISCLAIMER,
      ].join('\n'),
    );
  });

  test('perda máxima: o resultado negativo sai com o sinal de menos', () => {
    expect(
      formatGoalAlertMessage(
        goalPayload({ outcome: 'goal_stopped', finalValue: '9490.12', resultRate: '-0.050988' }),
      ),
    ).toBe(
      [
        'Perda máxima atingida · BTCUSDT 1d',
        'A simulação caiu a -5,1% do saldo inicial.',
        'Meta: 3,0% em 30 dias, perda máxima de 5,0%.',
        'Patrimônio simulado: 9490.12 (saldo inicial 10000).',
        CLOSING,
        DISCLAIMER,
      ].join('\n'),
    );
  });

  test('prazo vencido: ganho parcial com sinal e resultado zero sem sinal', () => {
    const expired = goalPayload({
      outcome: 'goal_expired',
      finalValue: '10100',
      resultRate: '0.01',
    });
    expect(formatGoalAlertMessage(expired)).toContain('Prazo da meta vencido · BTCUSDT 1d');
    expect(formatGoalAlertMessage(expired)).toContain(
      'Ao fim do prazo a simulação ficou em +1,0% do saldo inicial.',
    );
    const flat = goalPayload({ outcome: 'goal_expired', finalValue: '10000', resultRate: '0' });
    expect(formatGoalAlertMessage(flat)).toContain('ficou em 0,0% do saldo inicial.');
  });

  test('o texto nunca promete: frequência de simulação, sem "vai ganhar"', () => {
    for (const outcome of ['goal_reached', 'goal_stopped', 'goal_expired'] as const) {
      const text = formatGoalAlertMessage(goalPayload({ outcome })).toLowerCase();
      expect(text).toContain('simulação');
      expect(text).toContain('não é recomendação');
      expect(text).not.toContain('vai ganhar');
      expect(text).not.toContain('garant');
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

describe('despacho do desfecho da meta', () => {
  test('o alerta GOAL vai ao chat do dono com o texto do desfecho, uma vez', async () => {
    const subject = harness();
    subject.enqueue({ side: 'GOAL', payload: goalPayload() });
    const summary = await subject.dispatcher.tick();
    await subject.dispatcher.tick();
    expect(summary).toMatchObject({ claimed: 1, sent: 1, failed: 0 });
    expect(subject.bot.requests).toHaveLength(1);
    expect(subject.bot.requests[0]?.body.chat_id).toBe(CHAT_OF_A);
    expect(subject.bot.requests[0]?.body.text).toBe(formatGoalAlertMessage(goalPayload()));
  });

  test('o mesmo candle e execução enfileirado de novo não duplica o desfecho', () => {
    const subject = harness();
    expect(subject.enqueue({ side: 'GOAL', payload: goalPayload(), candleTime: START_TIME })).toBe(
      true,
    );
    expect(subject.enqueue({ side: 'GOAL', payload: goalPayload(), candleTime: START_TIME })).toBe(
      false,
    );
    expect(subject.alerts.rows).toHaveLength(1);
  });

  test('conteúdo de sinal sob o lado GOAL (e o inverso) não é enviado: falha com código estável', async () => {
    const subject = harness();
    subject.enqueue({ side: 'GOAL', payload: alertPayload() as never });
    subject.enqueue({ side: 'BUY', payload: goalPayload() });
    const summary = await subject.dispatcher.tick();
    expect(summary).toMatchObject({ claimed: 2, sent: 0, failed: 2 });
    expect(subject.alerts.rows.map((row) => row.lastError)).toStrictEqual([
      'bad_payload',
      'bad_payload',
    ]);
    expect(subject.bot.requests).toHaveLength(0);
  });

  test.each([
    ['desfecho desconhecido', { outcome: 'goal_won' }],
    ['campo a mais (um chat vazado no conteúdo)', { chatId: '730000001' }],
    ['prazo como texto', { horizonDays: '30' }],
    ['sem o saldo inicial', { initialBalance: undefined }],
  ])('conteúdo de meta inválido não é enviado: %s', async (_name, change) => {
    const subject = harness();
    subject.enqueue({ side: 'GOAL', payload: { ...goalPayload(), ...change } as never });
    const summary = await subject.dispatcher.tick();
    expect(summary).toMatchObject({ claimed: 1, sent: 0, failed: 1 });
    expect(subject.alerts.rows[0]?.lastError).toBe('bad_payload');
    expect(subject.bot.requests).toHaveLength(0);
  });

  test('o log do despacho do desfecho não carrega chat, par nem valores', async () => {
    const subject = harness();
    subject.enqueue({ side: 'GOAL', payload: goalPayload() });
    await subject.dispatcher.tick();
    const text = subject.logLines.join('');
    for (const content of [CHAT_OF_A, 'BTCUSDT', '10312.45', 'Meta atingida']) {
      expect(text).not.toContain(content);
    }
  });
});
