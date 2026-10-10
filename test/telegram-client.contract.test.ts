// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { loadAlertsApi } from './fixtures/telegram/alerts-api.fixture.js';
import {
  BOT_TOKEN,
  rateLimited,
  startFakeTelegramBot,
  telegramError,
  type FakeTelegramBot,
} from './fixtures/telegram/fake-telegram-bot.fixture.js';

const { createTelegramClient } = await loadAlertsApi();
const CHAT = '730000001';
const TEXT = 'Texto do alerta';
const SECONDS = 1_000;

let bot: FakeTelegramBot;

beforeAll(() => {
  bot = startFakeTelegramBot();
});

afterAll(async () => {
  await bot.stop();
});

function clientFor(baseUrl: string = bot.baseUrl): ReturnType<typeof createTelegramClient> {
  return createTelegramClient({ apiBaseUrl: baseUrl, botToken: BOT_TOKEN });
}

describe('cliente do Telegram: uma mensagem por chamada à Bot API', () => {
  test('POST /bot<token>/sendMessage com JSON { chat_id, text } e nada mais', async () => {
    const before = bot.requests.length;
    const result = await clientFor().sendMessage({ chatId: CHAT, text: TEXT });
    expect(result).toStrictEqual({ kind: 'sent' });
    const request = bot.requests[before];
    expect(request?.method).toBe('POST');
    expect(request?.path).toBe(`/bot${BOT_TOKEN}/sendMessage`);
    expect(request?.contentType).toContain('application/json');
    expect(request?.body).toStrictEqual({ chat_id: CHAT, text: TEXT });
  });

  test('429 pede espera: devolve o retry_after do Telegram em milissegundos', async () => {
    bot.script(rateLimited(7));
    const result = await clientFor().sendMessage({ chatId: CHAT, text: TEXT });
    expect(result).toStrictEqual({
      kind: 'retry',
      code: 'http_429',
      retryAfterMilliseconds: 7 * SECONDS,
    });
  });

  test('429 sem retry_after (ou ilegível) ainda é nova tentativa, sem tempo informado', async () => {
    bot.script({ status: 429, body: { ok: false } }, { status: 429, rawBody: 'não é json' });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(await clientFor().sendMessage({ chatId: CHAT, text: TEXT })).toStrictEqual({
        kind: 'retry',
        code: 'http_429',
        retryAfterMilliseconds: undefined,
      });
    }
  });

  test.each([500, 502, 503, 504])(
    '%i do Telegram é falha passageira: nova tentativa',
    async (status) => {
      bot.script(telegramError(status));
      expect(await clientFor().sendMessage({ chatId: CHAT, text: TEXT })).toStrictEqual({
        kind: 'retry',
        code: 'http_5xx',
        retryAfterMilliseconds: undefined,
      });
    },
  );

  test.each([400, 401, 403, 404])('%i é recusa definitiva: não adianta repetir', async (status) => {
    bot.script(telegramError(status, 'chat not found'));
    expect(await clientFor().sendMessage({ chatId: CHAT, text: TEXT })).toStrictEqual({
      kind: 'rejected',
      code: `http_${status}`,
    });
  });

  test('servidor fora do ar (conexão recusada) é falha passageira de rede', async () => {
    const dead = startFakeTelegramBot();
    const baseUrl = dead.baseUrl;
    await dead.stop();
    expect(await clientFor(baseUrl).sendMessage({ chatId: CHAT, text: TEXT })).toStrictEqual({
      kind: 'retry',
      code: 'network',
      retryAfterMilliseconds: undefined,
    });
  });

  test('resposta 200 que não é ok:true não conta como entregue', async () => {
    bot.script({ status: 200, body: { ok: false } }, { status: 200, rawBody: '<html>' });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await clientFor().sendMessage({ chatId: CHAT, text: TEXT });
      expect(result.kind).toBe('retry');
    }
  });

  test('resposta lenta demais estoura o prazo e vira nova tentativa', async () => {
    bot.script({ status: 200, body: { ok: true }, delayMilliseconds: 400 });
    const slow = createTelegramClient({
      apiBaseUrl: bot.baseUrl,
      botToken: BOT_TOKEN,
      timeoutMilliseconds: 50,
    });
    expect(await slow.sendMessage({ chatId: CHAT, text: TEXT })).toMatchObject({
      kind: 'retry',
      code: 'network',
    });
  });

  test('o token e o chat NUNCA voltam no resultado, nem no de erro', async () => {
    const dead = startFakeTelegramBot();
    const baseUrl = dead.baseUrl;
    await dead.stop();
    bot.script(telegramError(403, `bot ${BOT_TOKEN} blocked chat ${CHAT}`), rateLimited(1));
    const results = [
      await clientFor().sendMessage({ chatId: CHAT, text: TEXT }),
      await clientFor().sendMessage({ chatId: CHAT, text: TEXT }),
      await clientFor(baseUrl).sendMessage({ chatId: CHAT, text: TEXT }),
    ];
    const text = JSON.stringify(results);
    expect(text).not.toContain(BOT_TOKEN);
    expect(text).not.toContain(BOT_TOKEN.split(':')[0] ?? 'x');
    expect(text).not.toContain(CHAT);
  });

  test('a barra final da URL base não duplica o caminho', async () => {
    const original = globalThis.fetch;
    const urls: string[] = [];
    globalThis.fetch = ((input: string) => {
      urls.push(input);
      return Promise.resolve(Response.json({ ok: true }));
    }) as typeof fetch;
    try {
      const client = createTelegramClient({
        apiBaseUrl: 'https://api.example.test///',
        botToken: BOT_TOKEN,
      });
      expect(await client.sendMessage({ chatId: CHAT, text: TEXT })).toStrictEqual({
        kind: 'sent',
      });
    } finally {
      globalThis.fetch = original;
    }
    expect(urls).toStrictEqual([`https://api.example.test/bot${BOT_TOKEN}/sendMessage`]);
  });

  test('redirecionamento NÃO é seguido: o token iria para outro endereço', async () => {
    const before = bot.requests.length;
    bot.script({ status: 307, headers: { Location: `${bot.baseUrl}/vazou` } });
    const result = await clientFor().sendMessage({ chatId: CHAT, text: TEXT });
    expect(result.kind).toBe('retry');
    expect(bot.requests.slice(before).map((request) => request.path)).toStrictEqual([
      `/bot${BOT_TOKEN}/sendMessage`,
    ]);
  });
});
