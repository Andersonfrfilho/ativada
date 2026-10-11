// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import type { AlertRepository, ClaimAlertsParams } from '../packages/database/src/index.js';
import { loadAlertConstants, loadAlertsApi } from './fixtures/telegram/alerts-api.fixture.js';
import { alertPayload, REASON_TEXT } from './fixtures/telegram/alert-payload.fixture.js';
import {
  CHAT_OF_A,
  CHAT_OF_B,
  RUN_OF_A,
  RUN_OF_B,
  RUN_OF_C,
  SECOND,
  USER_A,
  USER_B,
  USER_C,
  createDispatcherHarness,
  type DispatcherHarness,
} from './fixtures/telegram/dispatcher-harness.fixture.js';
import {
  BOT_TOKEN,
  rateLimited,
  startFakeTelegramBot,
  telegramError,
} from './fixtures/telegram/fake-telegram-bot.fixture.js';

const { formatAlertMessage } = await loadAlertsApi();
const constants = await loadAlertConstants();
const open: DispatcherHarness[] = [];

function harness(options?: Parameters<typeof createDispatcherHarness>[0]): DispatcherHarness {
  const created = createDispatcherHarness(options);
  open.push(created);
  return created;
}

afterEach(async () => {
  for (const item of open.splice(0)) await item.stop();
});

function expectCleanLogs(subject: DispatcherHarness): void {
  const text = subject.logLines.join('');
  for (const secret of [BOT_TOKEN, BOT_TOKEN.split(':')[0] ?? 'x', CHAT_OF_A, CHAT_OF_B]) {
    expect(text).not.toContain(secret);
  }
  for (const content of [REASON_TEXT, '64000.1', 'BTCUSDT', 'chat not found']) {
    expect(text).not.toContain(content);
  }
}

describe('despacho do alerta: a mensagem certa, ao chat do dono, uma vez', () => {
  test('o texto montado do conteúdo vai ao chat vinculado do dono', async () => {
    const subject = harness();
    subject.enqueue();
    const summary = await subject.dispatcher.tick();
    expect(summary).toMatchObject({ claimed: 1, sent: 1, retried: 0, failed: 0, skipped: 0 });
    expect(subject.bot.requests).toHaveLength(1);
    expect(subject.bot.requests[0]?.body.chat_id).toBe(CHAT_OF_A);
    expect(subject.bot.requests[0]?.body.text).toBe(
      formatAlertMessage({ side: 'BUY', payload: alertPayload() as never }),
    );
    expect(subject.alerts.rows[0]?.status).toBe('sent');
    expect(subject.alerts.rows[0]?.sentAt).toBe(subject.clock.now);
    expectCleanLogs(subject);
  });

  test('o mesmo candle e lado enfileirado de novo não cria alerta nem segunda mensagem', async () => {
    const subject = harness();
    const candleTime = 1_700_000_000_000;
    expect(subject.enqueue({ candleTime })).toBe(true);
    expect(subject.enqueue({ candleTime })).toBe(false);
    await subject.dispatcher.tick();
    await subject.dispatcher.tick();
    subject.clock.now += 3_600 * SECOND;
    await subject.dispatcher.tick();
    expect(subject.alerts.rows).toHaveLength(1);
    expect(subject.bot.requests).toHaveLength(1);
  });

  test('o que já foi enviado não é enviado de novo em rondas seguintes, nem muito depois', async () => {
    const subject = harness();
    subject.enqueue();
    for (let round = 0; round < 5; round += 1) {
      await subject.dispatcher.tick();
      subject.clock.now += 3_600 * SECOND;
    }
    expect(subject.bot.requests).toHaveLength(1);
  });

  test('BUY e SELL do mesmo candle são dois alertas, cada um com o seu texto', async () => {
    const subject = harness();
    const candleTime = 1_700_000_000_000;
    subject.enqueue({ candleTime, side: 'BUY' });
    subject.enqueue({
      candleTime,
      side: 'SELL',
      payload: alertPayload({ simulatedAction: 'exit', reason: 'Venda 2/4' }),
    });
    await subject.dispatcher.tick();
    const texts = subject.bot.requests.map((request) => String(request.body.text));
    expect(texts).toHaveLength(2);
    expect(texts.some((text) => text.includes('COMPRA'))).toBe(true);
    expect(texts.some((text) => text.includes('VENDA') && text.includes('Venda 2/4'))).toBe(true);
  });

  test('a ordem de envio é a dos candles, do mais velho ao mais novo', async () => {
    const subject = harness();
    subject.enqueue({ candleTime: 3_000, payload: alertPayload({ reason: 'terceiro' }) });
    subject.enqueue({ candleTime: 1_000, payload: alertPayload({ reason: 'primeiro' }) });
    subject.enqueue({ candleTime: 2_000, payload: alertPayload({ reason: 'segundo' }) });
    await subject.dispatcher.tick();
    const order = subject.bot.requests.map((request) => String(request.body.text));
    expect(order[0]).toContain('primeiro');
    expect(order[1]).toContain('segundo');
    expect(order[2]).toContain('terceiro');
  });

  test('dois despachantes na mesma caixa de saída enviam UMA mensagem só', async () => {
    const subject = harness();
    subject.enqueue();
    await Promise.all([subject.dispatcher.tick(), subject.dispatcher.tick()]);
    expect(subject.bot.requests).toHaveLength(1);
  });
});

describe('despacho do alerta: só para quem tem vínculo, e só o dele', () => {
  test('dono sem Telegram vinculado: o alerta é dispensado e nada sai', async () => {
    const subject = harness({ linked: false });
    subject.enqueue();
    const summary = await subject.dispatcher.tick();
    expect(summary).toMatchObject({ claimed: 1, sent: 0, skipped: 1 });
    expect(subject.bot.requests).toHaveLength(0);
    expect(subject.alerts.rows[0]?.status).toBe('skipped');
    expect(subject.alerts.rows[0]?.lastError).toBe('no_link');
  });

  test('desvinculado depois de enfileirar: nada sai', async () => {
    const subject = harness();
    subject.enqueue();
    subject.alerts.linkChat(USER_A, undefined);
    await subject.dispatcher.tick();
    expect(subject.bot.requests).toHaveLength(0);
    expect(subject.alerts.rows[0]?.status).toBe('skipped');
  });

  test('três usuários: cada alerta vai ao chat do próprio dono e quem não tem vínculo não recebe', async () => {
    const subject = harness();
    subject.alerts.linkChat(USER_B, CHAT_OF_B);
    subject.enqueue({ userId: USER_A, runId: RUN_OF_A, payload: alertPayload({ reason: 'de A' }) });
    subject.enqueue({
      userId: USER_B,
      runId: RUN_OF_B,
      side: 'SELL',
      payload: alertPayload({ reason: 'de B' }),
    });
    subject.enqueue({ userId: USER_C, runId: RUN_OF_C, payload: alertPayload({ reason: 'de C' }) });
    await subject.dispatcher.tick();
    const byChat = new Map(
      subject.bot.requests.map((request) => [
        String(request.body.chat_id),
        String(request.body.text),
      ]),
    );
    expect([...byChat.keys()].sort()).toStrictEqual([CHAT_OF_A, CHAT_OF_B].sort());
    expect(byChat.get(CHAT_OF_A)).toContain('de A');
    expect(byChat.get(CHAT_OF_A)).not.toContain('de B');
    expect(byChat.get(CHAT_OF_B)).toContain('de B');
    expect(byChat.get(CHAT_OF_B)).not.toContain('de A');
    const rowOfC = subject.alerts.rows.find((row) => row.userId === USER_C);
    expect(rowOfC?.status).toBe('skipped');
  });
});

describe('despacho do alerta: falha do Telegram, repetição e desistência', () => {
  test('5xx: nova tentativa com espera crescente (30, 60, 120, 240 s) e desiste na quinta', async () => {
    const subject = harness();
    subject.bot.script(...Array.from({ length: 5 }, () => telegramError(503)));
    subject.enqueue();
    const waits = [30, 60, 120, 240];
    for (const wait of waits) {
      const summary = await subject.dispatcher.tick();
      expect(summary.retried).toBe(1);
      expect(subject.alerts.rows[0]?.status).toBe('pending');
      expect(subject.alerts.rows[0]?.nextAttemptAt).toBe(subject.clock.now + wait * SECOND);
      subject.clock.now += wait * SECOND - 1;
      expect((await subject.dispatcher.tick()).claimed).toBe(0);
      subject.clock.now += 1;
    }
    const last = await subject.dispatcher.tick();
    expect(last).toMatchObject({ failed: 1, retried: 0 });
    expect(subject.alerts.rows[0]).toMatchObject({
      status: 'failed',
      lastError: 'http_5xx',
      attempts: 5,
    });
    expect(subject.bot.requests).toHaveLength(5);
    subject.clock.now += 86_400 * SECOND;
    await subject.dispatcher.tick();
    expect(subject.bot.requests).toHaveLength(5);
    expectCleanLogs(subject);
  });

  test('falha passageira e depois sucesso: entregue, e a mensagem chega UMA vez', async () => {
    const subject = harness();
    subject.bot.script(telegramError(502));
    subject.enqueue();
    await subject.dispatcher.tick();
    subject.clock.now += 30 * SECOND;
    const summary = await subject.dispatcher.tick();
    expect(summary.sent).toBe(1);
    expect(subject.alerts.rows[0]?.status).toBe('sent');
    expect(subject.alerts.rows[0]?.attempts).toBe(2);
    subject.clock.now += 3_600 * SECOND;
    await subject.dispatcher.tick();
    expect(subject.bot.requests).toHaveLength(2);
  });

  test('429 respeita o retry_after quando ele é maior que a espera padrão', async () => {
    const subject = harness();
    subject.bot.script(rateLimited(120));
    subject.enqueue();
    await subject.dispatcher.tick();
    expect(subject.alerts.rows[0]?.nextAttemptAt).toBe(subject.clock.now + 120 * SECOND);
    subject.clock.now += 119 * SECOND;
    expect((await subject.dispatcher.tick()).claimed).toBe(0);
    subject.clock.now += SECOND;
    expect((await subject.dispatcher.tick()).sent).toBe(1);
  });

  test('429 com retry_after menor que a espera padrão ainda espera a padrão (nunca bate de novo antes)', async () => {
    const subject = harness();
    subject.bot.script(rateLimited(2));
    subject.enqueue();
    await subject.dispatcher.tick();
    expect(subject.alerts.rows[0]?.nextAttemptAt).toBe(subject.clock.now + 30 * SECOND);
  });

  test('429 com retry_after absurdo é limitado a 15 minutos', async () => {
    const subject = harness();
    subject.bot.script(rateLimited(86_400));
    subject.enqueue();
    await subject.dispatcher.tick();
    expect(subject.alerts.rows[0]?.nextAttemptAt).toBe(subject.clock.now + 900 * SECOND);
  });

  test.each([400, 401, 403, 404])(
    '%i: recusa definitiva, falha na hora e sem nova tentativa',
    async (status) => {
      const subject = harness();
      subject.bot.script(telegramError(status, 'chat not found'));
      subject.enqueue();
      const summary = await subject.dispatcher.tick();
      expect(summary).toMatchObject({ failed: 1, retried: 0, sent: 0 });
      expect(subject.alerts.rows[0]).toMatchObject({
        status: 'failed',
        lastError: `http_${status}`,
      });
      subject.clock.now += 3_600 * SECOND;
      await subject.dispatcher.tick();
      expect(subject.bot.requests).toHaveLength(1);
      expectCleanLogs(subject);
    },
  );

  test('Telegram fora do ar: o ciclo NÃO lança, o alerta fica para a próxima e o log não tem segredo', async () => {
    const dead = startFakeTelegramBot();
    const subject = harness({ bot: dead });
    await dead.stop();
    subject.enqueue();
    const summary = await subject.dispatcher.tick();
    expect(summary).toMatchObject({ retried: 1, sent: 0 });
    expect(subject.alerts.rows[0]).toMatchObject({ status: 'pending', lastError: 'network' });
    expectCleanLogs(subject);
  });

  test('conteúdo ilegível no banco: falha sem enviar e sem derrubar os demais', async () => {
    const subject = harness();
    subject.enqueue({ payload: { symbol: 'x' } });
    subject.enqueue({ payload: alertPayload({ reason: 'o bom' }) });
    const summary = await subject.dispatcher.tick();
    expect(summary).toMatchObject({ claimed: 2, failed: 1, sent: 1 });
    expect(subject.alerts.rows.find((row) => row.status === 'failed')?.lastError).toBe(
      'bad_payload',
    );
    expect(subject.bot.requests).toHaveLength(1);
    expect(String(subject.bot.requests[0]?.body.text)).toContain('o bom');
    expectCleanLogs(subject);
  });

  test('taxa de acerto ilegível no conteúdo: falha sem enviar, em vez de lançar e voltar para sempre', async () => {
    const subject = harness();
    subject.enqueue({ payload: alertPayload({ hitRate: { winRate: 'abc', trades: 3 } }) });
    const summary = await subject.dispatcher.tick();
    expect(summary).toMatchObject({ claimed: 1, failed: 1, errored: 0, sent: 0 });
    expect(subject.alerts.rows[0]).toMatchObject({ status: 'failed', lastError: 'bad_payload' });
    expect(subject.bot.requests).toHaveLength(0);
  });

  test('falha ao gravar o resultado de um alerta não impede os outros e não lança', async () => {
    const subject = harness();
    subject.enqueue({ payload: alertPayload({ reason: 'primeiro' }), candleTime: 1_000 });
    subject.enqueue({ payload: alertPayload({ reason: 'segundo' }), candleTime: 2_000 });
    const original = subject.alerts.repository.markSent;
    let calls = 0;
    const flaky = {
      ...subject.alerts.repository,
      markSent: (params: Parameters<typeof original>[0]): Promise<void> => {
        calls += 1;
        if (calls === 1) return Promise.reject(new Error(`banco indisponível ${CHAT_OF_A}`));
        return original(params);
      },
    };
    const { createAlertDispatcher, createTelegramClient } = await loadAlertsApi();
    const dispatcher = createAlertDispatcher({
      alerts: flaky,
      client: createTelegramClient({ apiBaseUrl: subject.bot.baseUrl, botToken: BOT_TOKEN }),
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
      now: () => subject.clock.now,
      dailyLimitPerUser: 1_000,
    });
    await dispatcher.tick();
    expect(subject.bot.requests).toHaveLength(2);
    expect(subject.alerts.rows.filter((row) => row.status === 'sent')).toHaveLength(1);
  });
});

describe('despacho do alerta: o alerta veneno não é reivindicado para sempre', () => {
  async function dispatcherWhereRecordingFails(subject: DispatcherHarness): Promise<{
    readonly tick: () => ReturnType<DispatcherHarness['dispatcher']['tick']>;
  }> {
    const { createAlertDispatcher, createTelegramClient } = await loadAlertsApi();
    const alwaysBroken = {
      ...subject.alerts.repository,
      markSent: (): Promise<void> => Promise.reject(new Error('banco indisponível')),
    };
    return createAlertDispatcher({
      alerts: alwaysBroken,
      client: createTelegramClient({ apiBaseUrl: subject.bot.baseUrl, botToken: BOT_TOKEN }),
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
      now: () => subject.clock.now,
      dailyLimitPerUser: 1_000,
    });
  }

  test('o teto de reivindicações vai ao repositório, que é quem o aplica', async () => {
    const subject = harness();
    const seen: number[] = [];
    const spy = {
      ...subject.alerts.repository,
      claimDue: (params: ClaimAlertsParams): ReturnType<AlertRepository['claimDue']> => {
        seen.push(params.maximumAttempts);
        return subject.alerts.repository.claimDue(params);
      },
    };
    const { createAlertDispatcher, createTelegramClient } = await loadAlertsApi();
    const dispatcher = createAlertDispatcher({
      alerts: spy,
      client: createTelegramClient({ apiBaseUrl: subject.bot.baseUrl, botToken: BOT_TOKEN }),
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
      now: () => subject.clock.now,
      dailyLimitPerUser: 1_000,
    });
    await dispatcher.tick();
    expect(seen).toStrictEqual([constants.ALERT_MAX_ATTEMPTS]);
  });

  test('entrega que quebra antes de gravar o resultado é tentada até o teto e então encerrada como falha', async () => {
    const subject = harness();
    subject.enqueue();
    const dispatcher = await dispatcherWhereRecordingFails(subject);
    const claimedPerRound: number[] = [];
    for (let round = 0; round < constants.ALERT_MAX_ATTEMPTS + 3; round += 1) {
      claimedPerRound.push((await dispatcher.tick()).claimed);
      subject.clock.now += constants.ALERT_LEASE_MILLISECONDS + 1;
    }
    expect(claimedPerRound).toStrictEqual([
      ...Array.from({ length: constants.ALERT_MAX_ATTEMPTS }, () => 1),
      0,
      0,
      0,
    ]);
    expect(subject.bot.requests).toHaveLength(constants.ALERT_MAX_ATTEMPTS);
    expect(subject.alerts.rows[0]).toMatchObject({
      status: 'failed',
      lastError: 'attempts_exhausted',
    });
  });
});

describe('despacho do alerta: o arrendamento cobre o pior caso do lote', () => {
  test('o arrendamento passa de lote × prazo do envio, senão outro despachante reenviaria', async () => {
    const subject = harness();
    const seen: { limit: number; leaseMilliseconds: number }[] = [];
    const spy = {
      ...subject.alerts.repository,
      claimDue: (params: ClaimAlertsParams): ReturnType<AlertRepository['claimDue']> => {
        seen.push({ limit: params.limit, leaseMilliseconds: params.leaseMilliseconds });
        return subject.alerts.repository.claimDue(params);
      },
    };
    const { createAlertDispatcher, createTelegramClient } = await loadAlertsApi();
    const dispatcher = createAlertDispatcher({
      alerts: spy,
      client: createTelegramClient({ apiBaseUrl: subject.bot.baseUrl, botToken: BOT_TOKEN }),
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
      now: () => subject.clock.now,
      dailyLimitPerUser: 1_000,
    });
    await dispatcher.tick();
    expect(seen).toStrictEqual([
      { limit: constants.ALERT_BATCH_SIZE, leaseMilliseconds: constants.ALERT_LEASE_MILLISECONDS },
    ]);
    expect(constants.ALERT_LEASE_MILLISECONDS).toBeGreaterThan(
      constants.ALERT_BATCH_SIZE * constants.ALERT_REQUEST_TIMEOUT_MILLISECONDS,
    );
  });
});

describe('despacho do alerta: teto de mensagens por usuário nas últimas 24 horas', () => {
  const LIMIT = 3;
  const DAY = 24 * 3_600 * SECOND;

  test('acima do teto o alerta é dispensado com daily_limit e nada sai para o Telegram', async () => {
    const subject = harness({ dailyLimitPerUser: LIMIT });
    for (let alert = 0; alert < 5; alert += 1) subject.enqueue();
    const summary = await subject.dispatcher.tick();
    expect(summary).toMatchObject({ claimed: 5, sent: LIMIT, skipped: 2, failed: 0 });
    expect(subject.bot.requests).toHaveLength(LIMIT);
    const skipped = subject.alerts.rows.filter((row) => row.status === 'skipped');
    expect(skipped.map((row) => row.lastError)).toStrictEqual(['daily_limit', 'daily_limit']);
  });

  test('o teto é por usuário: o outro dono continua recebendo', async () => {
    const subject = harness({ dailyLimitPerUser: LIMIT });
    subject.alerts.linkChat(USER_B, CHAT_OF_B);
    for (let alert = 0; alert < 5; alert += 1) subject.enqueue();
    subject.enqueue({ userId: USER_B, runId: RUN_OF_B });
    await subject.dispatcher.tick();
    const toB = subject.bot.requests.filter((request) => request.body.chat_id === CHAT_OF_B);
    expect(toB).toHaveLength(1);
    expect(subject.bot.requests).toHaveLength(LIMIT + 1);
  });

  test('a janela anda: 24 horas depois do envio o usuário volta a receber', async () => {
    const subject = harness({ dailyLimitPerUser: LIMIT });
    for (let alert = 0; alert < LIMIT; alert += 1) subject.enqueue();
    await subject.dispatcher.tick();
    subject.enqueue();
    await subject.dispatcher.tick();
    expect(subject.bot.requests).toHaveLength(LIMIT);
    subject.clock.now += DAY - SECOND;
    subject.enqueue();
    await subject.dispatcher.tick();
    expect(subject.bot.requests).toHaveLength(LIMIT);
    subject.clock.now += 2 * SECOND;
    subject.enqueue();
    await subject.dispatcher.tick();
    expect(subject.bot.requests).toHaveLength(LIMIT + 1);
  });

  test('só mensagem ENVIADA conta: dispensadas e falhas não gastam o teto', async () => {
    const subject = harness({ dailyLimitPerUser: 1, linked: false });
    for (let alert = 0; alert < 3; alert += 1) subject.enqueue();
    await subject.dispatcher.tick();
    expect(subject.alerts.rows.every((row) => row.status === 'skipped')).toBe(true);
    subject.alerts.linkChat(USER_A, CHAT_OF_A);
    subject.enqueue();
    await subject.dispatcher.tick();
    expect(subject.bot.requests).toHaveLength(1);
  });
});
