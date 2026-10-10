// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import {
  BOT_MESSAGE,
  CHAT_BLOCK_MILLISECONDS,
  LINK_CODE_TIME_TO_LIVE_SECONDS,
  TELEGRAM_WEBHOOK_PATH,
} from '../apps/api-cryptoada/src/telegram/telegram.constant.js';
import { userIdFromDatabase } from '../packages/database/src/ownership/user-id.js';
import { FAKE_BOT_TOKEN, FAKE_WEBHOOK_SECRET } from './fixtures/fake-telegram.fixture.js';
import {
  CHAT_OF_A,
  CHAT_OF_B,
  buildStartUpdate,
  callWebhook,
  issueLinkCode,
  linkedChatOf,
  submitCode,
} from './fixtures/telegram-calls.fixture.js';
import { SUBJECT_A, SUBJECT_B, USER_A_ID, USER_B_ID } from './fixtures/profile-harness.fixture.js';
import {
  createTelegramHarness,
  type TelegramHarness,
} from './fixtures/telegram-harness.fixture.js';

const SECOND_MILLISECONDS = 1_000;
const WRONG_CODE = 'ZZZZZZZZZZ';

let harness: TelegramHarness;

beforeEach(async () => {
  harness = await createTelegramHarness();
});

afterEach(async () => {
  await harness.stop();
});

function unlinkEveryChat(): void {
  for (const user of harness.users.users.values()) user.telegramChatId = undefined;
}

describe('webhook authentication', () => {
  test.each([
    ['without the secret header', null],
    ['with a wrong secret', 'wrong_contract_webhook_secret_0001'],
    ['with an empty secret', ''],
    ['with a short secret', 'x'],
  ])('answers 401 and changes nothing %s', async (_description, secret) => {
    const code = await issueLinkCode(harness, SUBJECT_A);
    const response = await callWebhook(harness, {
      secret,
      body: buildStartUpdate({ chatId: CHAT_OF_A, code }),
    });
    expect(response.status).toBe(401);
    expect(linkedChatOf(harness, USER_A_ID)).toBeUndefined();
    expect(harness.telegram.linkCodes.has(userIdFromDatabase(USER_A_ID))).toBe(true);
    expect(harness.fakeTelegram.sentMessages).toHaveLength(0);
  });

  test('accepts the configured secret', async () => {
    const response = await callWebhook(harness, {
      secret: FAKE_WEBHOOK_SECRET,
      body: { update_id: 2 },
    });
    expect(response.status).toBe(200);
  });

  test('the route does not exist without a configured secret', async () => {
    const unconfigured = await createTelegramHarness({ isWebhookConfigured: false });
    try {
      const response = await callWebhook(unconfigured, { body: { update_id: 2 } });
      const body = (await response.json()) as { error: { code: string } };
      expect(response.status).toBe(404);
      expect(body.error.code).toBe('ROUTE_NOT_FOUND');
      expect(unconfigured.api.routes.some((route) => route.path === TELEGRAM_WEBHOOK_PATH)).toBe(
        false,
      );
    } finally {
      await unconfigured.stop();
    }
  });

  test('issuing a code answers 503 FEATURE_DISABLED without configuration, unlinking still works', async () => {
    const unconfigured = await createTelegramHarness({
      isWebhookConfigured: false,
      isLinkCodeIssuingConfigured: false,
    });
    try {
      const token = await unconfigured.tokenFor(SUBJECT_A);
      const issued = await unconfigured.api.sendThroughHandler({
        path: '/v1/me/telegram-link',
        method: 'POST',
        token,
      });
      const body = (await issued.json()) as { error: { code: string } };
      expect([issued.status, body.error.code]).toStrictEqual([503, 'FEATURE_DISABLED']);
      const unlinked = await unconfigured.api.sendThroughHandler({
        path: '/v1/me/telegram-link',
        method: 'DELETE',
        token,
      });
      expect(unlinked.status).toBe(204);
    } finally {
      await unconfigured.stop();
    }
  });
});

describe('linking by code', () => {
  test('links the chat to the owner of the code and confirms to the chat', async () => {
    const code = await issueLinkCode(harness, SUBJECT_A);
    const response = await submitCode(harness, { chatId: CHAT_OF_A, code });
    expect(response.status).toBe(200);
    expect(linkedChatOf(harness, USER_A_ID)).toBe(CHAT_OF_A);
    expect(linkedChatOf(harness, USER_B_ID)).toBeUndefined();
    expect(harness.fakeTelegram.sentMessages).toStrictEqual([
      { path: `/bot${FAKE_BOT_TOKEN}/sendMessage`, chatId: CHAT_OF_A, text: BOT_MESSAGE.LINKED },
    ]);
  });

  test('accepts the code in lower case', async () => {
    const code = await issueLinkCode(harness, SUBJECT_A);
    await submitCode(harness, { chatId: CHAT_OF_A, code: code.toLowerCase() });
    expect(linkedChatOf(harness, USER_A_ID)).toBe(CHAT_OF_A);
  });

  test('the code is single use', async () => {
    const code = await issueLinkCode(harness, SUBJECT_A);
    await submitCode(harness, { chatId: CHAT_OF_A, code });
    unlinkEveryChat();
    await submitCode(harness, { chatId: CHAT_OF_B, code });
    expect(linkedChatOf(harness, USER_A_ID)).toBeUndefined();
    expect(linkedChatOf(harness, USER_B_ID)).toBeUndefined();
  });

  test('the code expires after 10 minutes', async () => {
    const code = await issueLinkCode(harness, SUBJECT_A);
    harness.clock.advance(LINK_CODE_TIME_TO_LIVE_SECONDS * SECOND_MILLISECONDS + 1);
    await submitCode(harness, { chatId: CHAT_OF_A, code });
    expect(linkedChatOf(harness, USER_A_ID)).toBeUndefined();
    expect(harness.fakeTelegram.sentMessages.at(-1)?.text).toBe(BOT_MESSAGE.REJECTED);
  });

  test('the code still works just before the expiry', async () => {
    const code = await issueLinkCode(harness, SUBJECT_A);
    harness.clock.advance(LINK_CODE_TIME_TO_LIVE_SECONDS * SECOND_MILLISECONDS - 1_000);
    await submitCode(harness, { chatId: CHAT_OF_A, code });
    expect(linkedChatOf(harness, USER_A_ID)).toBe(CHAT_OF_A);
  });

  test('a chat already linked to another user cannot be linked again', async () => {
    await submitCode(harness, { chatId: CHAT_OF_A, code: await issueLinkCode(harness, SUBJECT_A) });
    await submitCode(harness, { chatId: CHAT_OF_A, code: await issueLinkCode(harness, SUBJECT_B) });
    expect(linkedChatOf(harness, USER_A_ID)).toBe(CHAT_OF_A);
    expect(linkedChatOf(harness, USER_B_ID)).toBeUndefined();
  });

  test('ignores groups and messages that are not /start with a code', async () => {
    const code = await issueLinkCode(harness, SUBJECT_A);
    const group = { message: { chat: { id: -100, type: 'group' }, text: `/start ${code}` } };
    const plain = { message: { chat: { id: 5, type: 'private' }, text: code } };
    const bare = { message: { chat: { id: 5, type: 'private' }, text: '/start' } };
    for (const body of [group, plain, bare, { update_id: 9 }]) {
      expect((await callWebhook(harness, { body })).status).toBe(200);
    }
    expect(linkedChatOf(harness, USER_A_ID)).toBeUndefined();
    expect(harness.fakeTelegram.sentMessages).toHaveLength(0);
  });

  test.each([
    ['a message whose chat has an unexpected shape', { message: { chat: 'x' } }],
    [
      'a long text',
      { message: { chat: { id: 5, type: 'private' }, text: `/start ${'A'.repeat(2_000)}` } },
    ],
    [
      'a photo without text',
      { message: { chat: { id: 5, type: 'private' }, photo: [{ file_id: 'abc' }] } },
    ],
    ['a text that is not a string', { message: { chat: { id: 5, type: 'private' }, text: 42 } }],
    ['an array', []],
  ])('answers 200 { received: true } and does nothing for %s', async (_description, body) => {
    const response = await callWebhook(harness, { body });
    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ data: { received: true } });
    expect(harness.fakeTelegram.sentMessages).toHaveLength(0);
  });

  test('answers 400 only when the body is not JSON', async () => {
    const response = await callWebhook(harness, { body: undefined, rawBody: '{not json' });
    expect(response.status).toBe(400);
  });

  test('still answers 200 when the confirmation cannot be sent', async () => {
    harness.fakeTelegram.setFailing(true);
    const code = await issueLinkCode(harness, SUBJECT_A);
    const response = await submitCode(harness, { chatId: CHAT_OF_A, code });
    expect(response.status).toBe(200);
    expect(linkedChatOf(harness, USER_A_ID)).toBe(CHAT_OF_A);
  });
});

describe('identical answer for nonexistent, expired and used codes', () => {
  test('same HTTP answer and same chat message in the three cases', async () => {
    const expiredCode = await issueLinkCode(harness, SUBJECT_B);
    harness.clock.advance(LINK_CODE_TIME_TO_LIVE_SECONDS * SECOND_MILLISECONDS + 1);
    const usedCode = await issueLinkCode(harness, SUBJECT_A);
    await submitCode(harness, { chatId: CHAT_OF_A, code: usedCode });
    unlinkEveryChat();
    harness.fakeTelegram.sentMessages.length = 0;

    const answers: string[] = [];
    for (const [index, code] of [WRONG_CODE, expiredCode, usedCode].entries()) {
      const chatId = String(800000000 + index);
      const response = await submitCode(harness, { chatId, code });
      answers.push(`${response.status}|${await response.text()}`);
    }
    expect(new Set(answers).size).toBe(1);
    const replies = harness.fakeTelegram.sentMessages.map((message) => message.text);
    expect(replies).toStrictEqual([
      BOT_MESSAGE.REJECTED,
      BOT_MESSAGE.REJECTED,
      BOT_MESSAGE.REJECTED,
    ]);
  });
});

describe('attempt limits', () => {
  test('blocks a chat after 5 wrong codes, even for a valid code, for one hour', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await submitCode(harness, { chatId: CHAT_OF_A, code: WRONG_CODE });
    }
    const code = await issueLinkCode(harness, SUBJECT_A);
    const repliesBefore = harness.fakeTelegram.sentMessages.length;
    await submitCode(harness, { chatId: CHAT_OF_A, code });
    expect(linkedChatOf(harness, USER_A_ID)).toBeUndefined();
    expect(harness.fakeTelegram.sentMessages).toHaveLength(repliesBefore);

    harness.clock.advance(CHAT_BLOCK_MILLISECONDS + 1);
    const freshCode = await issueLinkCode(harness, SUBJECT_A);
    await submitCode(harness, { chatId: CHAT_OF_A, code: freshCode });
    expect(linkedChatOf(harness, USER_A_ID)).toBe(CHAT_OF_A);
  });

  test('the block of one chat does not affect another chat', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await submitCode(harness, { chatId: CHAT_OF_A, code: WRONG_CODE });
    }
    await submitCode(harness, { chatId: CHAT_OF_B, code: await issueLinkCode(harness, SUBJECT_B) });
    expect(linkedChatOf(harness, USER_B_ID)).toBe(CHAT_OF_B);
  });

  test('failures older than the window do not add up', async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await submitCode(harness, { chatId: CHAT_OF_A, code: WRONG_CODE });
    }
    harness.clock.advance(11 * 60 * SECOND_MILLISECONDS);
    await submitCode(harness, { chatId: CHAT_OF_A, code: WRONG_CODE });
    await submitCode(harness, { chatId: CHAT_OF_A, code: await issueLinkCode(harness, SUBJECT_A) });
    expect(linkedChatOf(harness, USER_A_ID)).toBe(CHAT_OF_A);
  });

  test('a code dies after 5 refused attempts, even from different chats', async () => {
    await submitCode(harness, { chatId: CHAT_OF_A, code: await issueLinkCode(harness, SUBJECT_A) });
    const codeOfB = await issueLinkCode(harness, SUBJECT_B);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await submitCode(harness, { chatId: CHAT_OF_A, code: codeOfB });
      harness.fakeTelegram.sentMessages.length = 0;
    }
    expect(harness.telegram.linkCodes.has(userIdFromDatabase(USER_B_ID))).toBe(false);
  });
});

describe('secrets never reach the logs', () => {
  test('chat id, code, bot token and webhook secret stay out of the log', async () => {
    const code = await issueLinkCode(harness, SUBJECT_A);
    await submitCode(harness, { chatId: CHAT_OF_A, code });
    await submitCode(harness, { chatId: CHAT_OF_B, code: WRONG_CODE });
    await callWebhook(harness, { secret: 'wrong_contract_webhook_secret_0001', body: {} });
    const log = harness.api.logLines.join('');
    for (const secret of [
      CHAT_OF_A,
      CHAT_OF_B,
      code,
      WRONG_CODE,
      FAKE_BOT_TOKEN,
      FAKE_WEBHOOK_SECRET,
    ]) {
      expect(log).not.toContain(secret);
    }
  });
});
