// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { hashSecret } from '../apps/api-crypto/src/shared/crypto/hash-secret.js';
import { TELEGRAM_LINK_PATH } from '../apps/api-crypto/src/telegram/telegram.constant.js';
import { userIdFromDatabase } from '../packages/database/src/ownership/user-id.js';
import {
  CHAT_OF_A,
  CHAT_OF_B,
  issueLinkCode,
  linkedChatOf,
  submitCode,
} from './fixtures/telegram-calls.fixture.js';
import { SUBJECT_A, SUBJECT_B, USER_A_ID, USER_B_ID } from './fixtures/profile-harness.fixture.js';
import {
  createTelegramHarness,
  type TelegramHarness,
} from './fixtures/telegram-harness.fixture.js';

const MINUTE_MILLISECONDS = 60_000;

let harness: TelegramHarness;

beforeAll(async () => {
  harness = await createTelegramHarness();
});

afterAll(async () => {
  await harness.stop();
});

async function callLink(subject: string | undefined, method: string): Promise<Response> {
  return harness.api.sendThroughHandler({
    path: TELEGRAM_LINK_PATH,
    method,
    ...(subject === undefined ? {} : { token: await harness.tokenFor(subject) }),
  });
}

describe('POST /v1/me/telegram-link', () => {
  test('requires authentication', async () => {
    expect((await callLink(undefined, 'POST')).status).toBe(401);
    expect((await callLink(undefined, 'DELETE')).status).toBe(401);
  });

  test('issues a base32 code of at least 8 characters valid for 10 minutes', async () => {
    const response = await callLink(SUBJECT_A, 'POST');
    const body = (await response.json()) as { data: { code: string; expiresInSeconds: number } };
    expect(response.status).toBe(201);
    expect(body.data.code).toMatch(/^[A-Z2-7]{8,}$/);
    expect(body.data.expiresInSeconds).toBe(600);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  test('generates a different code each time', async () => {
    const codes = new Set<string>();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      codes.add(await issueLinkCode(harness, SUBJECT_B));
    }
    expect(codes.size).toBe(3);
  });

  test('stores only the hash of the code, with a 10 minute expiry', async () => {
    const code = await issueLinkCode(harness, SUBJECT_A);
    const stored = harness.telegram.linkCodes.get(userIdFromDatabase(USER_A_ID));
    expect(stored?.codeHash).toBe(hashSecret(code));
    expect(JSON.stringify([...harness.telegram.linkCodes.values()])).not.toContain(code);
    const lifetime = (stored?.expiresAt.getTime() ?? 0) - harness.clock.now();
    expect(lifetime).toBe(10 * MINUTE_MILLISECONDS);
  });

  test('a new code invalidates the previous one of the same user', async () => {
    const first = await issueLinkCode(harness, SUBJECT_A);
    const second = await issueLinkCode(harness, SUBJECT_A);
    await submitCode(harness, { chatId: CHAT_OF_A, code: first });
    expect(linkedChatOf(harness, USER_A_ID)).toBeUndefined();
    await submitCode(harness, { chatId: CHAT_OF_A, code: second });
    expect(linkedChatOf(harness, USER_A_ID)).toBe(CHAT_OF_A);
    await callLink(SUBJECT_A, 'DELETE');
  });

  test('issuing a code for one user never touches the code of another', async () => {
    const codeOfA = await issueLinkCode(harness, SUBJECT_A);
    await issueLinkCode(harness, SUBJECT_B);
    await submitCode(harness, { chatId: CHAT_OF_A, code: codeOfA });
    expect(linkedChatOf(harness, USER_A_ID)).toBe(CHAT_OF_A);
    expect(linkedChatOf(harness, USER_B_ID)).toBeUndefined();
    expect(harness.telegram.linkCodes.has(userIdFromDatabase(USER_B_ID))).toBe(true);
  });
});

describe('DELETE /v1/me/telegram-link', () => {
  test('unlinks only the caller and is idempotent', async () => {
    const codeOfB = await issueLinkCode(harness, SUBJECT_B);
    await submitCode(harness, { chatId: CHAT_OF_B, code: codeOfB });
    expect(linkedChatOf(harness, USER_B_ID)).toBe(CHAT_OF_B);
    expect(linkedChatOf(harness, USER_A_ID)).toBe(CHAT_OF_A);

    const first = await callLink(SUBJECT_B, 'DELETE');
    const second = await callLink(SUBJECT_B, 'DELETE');
    expect([first.status, second.status]).toStrictEqual([204, 204]);
    expect(linkedChatOf(harness, USER_B_ID)).toBeUndefined();
    expect(linkedChatOf(harness, USER_A_ID)).toBe(CHAT_OF_A);
  });

  test('also discards a pending code', async () => {
    const pending = await issueLinkCode(harness, SUBJECT_B);
    await callLink(SUBJECT_B, 'DELETE');
    await submitCode(harness, { chatId: CHAT_OF_B, code: pending });
    expect(linkedChatOf(harness, USER_B_ID)).toBeUndefined();
  });
});
