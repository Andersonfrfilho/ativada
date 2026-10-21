// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import {
  resumeAlertPayloadSchema,
  stallAlertPayloadSchema,
} from '../apps/worker-ativada/src/live/alert-payload.schema.js';
import { loadApiApp } from './fixtures/api-routes/api-app.fixture.js';
import { loadAlertsApi } from './fixtures/telegram/alerts-api.fixture.js';
import {
  CHAT_OF_A,
  RUN_OF_A,
  SECOND,
  createDispatcherHarness,
  type DispatcherHarness,
} from './fixtures/telegram/dispatcher-harness.fixture.js';
import { BOT_TOKEN } from './fixtures/telegram/fake-telegram-bot.fixture.js';

const { formatStallAlertMessage, formatResumeAlertMessage } = await loadAlertsApi();
const { stallAlertPayload } = await loadApiApp();
const open: DispatcherHarness[] = [];

function harness(options?: Parameters<typeof createDispatcherHarness>[0]): DispatcherHarness {
  const created = createDispatcherHarness(options);
  open.push(created);
  return created;
}

afterEach(async () => {
  for (const item of open.splice(0)) await item.stop();
});

// 2026-10-13T14:05:00Z e 16:10:00Z
const STALLED_SINCE = Date.UTC(2026, 9, 13, 14, 5);
const RESUMED_AT = Date.UTC(2026, 9, 13, 16, 10);
const STALL_PAYLOAD = { symbol: 'BTCUSDT', timeframe: '1h', stalledSince: STALLED_SINCE };
const RESUME_PAYLOAD = { ...STALL_PAYLOAD, resumedAt: RESUMED_AT };

describe('texto do aviso de parada e de volta', () => {
  test('a parada diz o par, a vela e o horário em UTC', () => {
    expect(formatStallAlertMessage(STALL_PAYLOAD)).toBe(
      [
        'Simulação parada · BTCUSDT 1h',
        'Está sem avançar desde 13/10 14:05 UTC. O sistema está tentando retomar.',
        'Nenhuma operação foi perdida.',
        'Simulação: nenhum dinheiro real foi usado.',
      ].join('\n'),
    );
  });

  test('a volta diz desde quando ficou parada e quando voltou', () => {
    expect(formatResumeAlertMessage(RESUME_PAYLOAD)).toBe(
      [
        'Simulação voltou · BTCUSDT 1h',
        'Ficou parada desde 13/10 14:05 UTC e voltou a andar às 13/10 16:10 UTC.',
        'Nenhuma operação foi perdida.',
        'Simulação: nenhum dinheiro real foi usado.',
      ].join('\n'),
    );
  });
});

describe('o conteúdo que a API grava é o que o worker aceita', () => {
  const candidate = {
    runId: 'run-x',
    symbol: 'BTCUSDT',
    timeframe: '1h',
    periodStart: 0,
    lastCandleTime: undefined,
    isWaitingForData: false,
    stalledSince: undefined,
  };

  test('os dois conteúdos montados pela varredura passam no esquema estrito do despachante', () => {
    const stall = stallAlertPayload.buildStallAlertPayload({
      candidate,
      stalledSince: STALLED_SINCE,
    });
    const resume = stallAlertPayload.buildResumeAlertPayload({
      candidate,
      stalledSince: STALLED_SINCE,
      resumedAt: RESUMED_AT,
    });
    expect(stallAlertPayloadSchema.safeParse(stall).success).toBe(true);
    expect(resumeAlertPayloadSchema.safeParse(resume).success).toBe(true);
    expect(stall).toStrictEqual(STALL_PAYLOAD);
    expect(resume).toStrictEqual(RESUME_PAYLOAD);
  });
});

describe('despacho do aviso de parada pela Bot API falsa', () => {
  test('STALL e RESUME vão ao chat do dono, cada um uma vez, e ficam enviados', async () => {
    const subject = harness();
    subject.enqueue({ side: 'STALL', candleTime: STALLED_SINCE, payload: STALL_PAYLOAD });
    subject.enqueue({ side: 'RESUME', candleTime: STALLED_SINCE, payload: RESUME_PAYLOAD });
    const summary = await subject.dispatcher.tick();
    expect(summary).toMatchObject({ claimed: 2, sent: 2, failed: 0, skipped: 0 });
    expect(subject.bot.requests.map((request) => request.body.chat_id)).toStrictEqual([
      CHAT_OF_A,
      CHAT_OF_A,
    ]);
    expect(subject.bot.requests.map((request) => request.body.text)).toStrictEqual([
      formatStallAlertMessage(STALL_PAYLOAD),
      formatResumeAlertMessage(RESUME_PAYLOAD),
    ]);
    expect((await subject.dispatcher.tick()).claimed).toBe(0);
  });

  test('worker morto: o STALL fica pendente na caixa de saída e só sai quando ele volta', async () => {
    const subject = harness();
    subject.enqueue({ side: 'STALL', candleTime: STALLED_SINCE, payload: STALL_PAYLOAD });
    subject.clock.now += 3_600 * SECOND;
    expect(subject.bot.requests).toHaveLength(0);
    expect(subject.alerts.rows.map((row) => row.status)).toStrictEqual(['pending']);
    await subject.dispatcher.tick();
    expect(subject.bot.requests).toHaveLength(1);
  });

  test('respeita o teto diário do usuário: o aviso acima dele é dispensado com daily_limit', async () => {
    const subject = harness({ dailyLimitPerUser: 1 });
    subject.enqueue({ side: 'STALL', candleTime: STALLED_SINCE, payload: STALL_PAYLOAD });
    subject.enqueue({ side: 'RESUME', candleTime: STALLED_SINCE, payload: RESUME_PAYLOAD });
    const summary = await subject.dispatcher.tick();
    expect(summary).toMatchObject({ sent: 1, skipped: 1 });
    expect(subject.alerts.rows.find((row) => row.status === 'skipped')?.lastError).toBe(
      'daily_limit',
    );
  });

  test('conteúdo com dado a mais (PII) ou faltando não é enviado: falha como bad_payload', async () => {
    const subject = harness();
    subject.enqueue({
      side: 'STALL',
      candleTime: STALLED_SINCE,
      payload: { ...STALL_PAYLOAD, email: 'pessoa@exemplo.com' },
    });
    subject.enqueue({
      side: 'RESUME',
      candleTime: STALLED_SINCE,
      payload: STALL_PAYLOAD,
    });
    const summary = await subject.dispatcher.tick();
    expect(summary).toMatchObject({ sent: 0, failed: 2 });
    expect(subject.bot.requests).toHaveLength(0);
    expect(subject.alerts.rows.map((row) => row.lastError)).toStrictEqual([
      'bad_payload',
      'bad_payload',
    ]);
  });

  test('o log do envio não leva token, chat, par nem horário', async () => {
    const subject = harness();
    subject.enqueue({ side: 'STALL', candleTime: STALLED_SINCE, payload: STALL_PAYLOAD });
    await subject.dispatcher.tick();
    const text = subject.logLines.join('');
    for (const secret of [BOT_TOKEN, CHAT_OF_A, RUN_OF_A, 'BTCUSDT', '14:05']) {
      expect(text).not.toContain(secret);
    }
  });
});
