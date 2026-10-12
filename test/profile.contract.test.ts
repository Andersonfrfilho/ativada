// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { userIdFromDatabase } from '../packages/database/src/ownership/user-id.js';
import { ME_PATH } from '../apps/api-ativada/src/profile/profile.constant.js';
import {
  SUBJECT_A,
  SUBJECT_B,
  USER_A_ID,
  USER_B_ID,
  createProfileHarness,
  type ProfileHarness,
} from './fixtures/profile-harness.fixture.js';

const PROFILE_KEYS = [
  'alertTelegramEnabled',
  'createdAt',
  'displayCurrency',
  'displayName',
  'id',
  'telegramLinked',
  'timezone',
];
const FORBIDDEN_FRAGMENTS = ['telegram_chat_id', 'telegramChatId', 'email', 'keycloak', 'sub'];
const CHAT_ID_OF_A = '555123987';

let harness: ProfileHarness;

beforeAll(async () => {
  harness = await createProfileHarness();
});

afterAll(async () => {
  await harness.stop();
});

type CallParams = { readonly subject: string; readonly method?: string; readonly body?: unknown };

async function callMe(params: CallParams): Promise<Response> {
  return harness.api.sendThroughHandler({
    path: ME_PATH,
    method: params.method ?? 'GET',
    token: await harness.tokenFor(params.subject),
    headers: { 'Content-Type': 'application/json' },
    ...(params.body === undefined ? {} : { body: JSON.stringify(params.body) }),
  });
}

async function readData(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json()) as { data: Record<string, unknown> };
  return body.data;
}

describe('GET /v1/me', () => {
  test('requires authentication', async () => {
    const response = await harness.api.sendThroughHandler({ path: ME_PATH });
    expect(response.status).toBe(401);
  });

  test('returns exactly the profile fields and never the forbidden ones', async () => {
    const stored = harness.store.users.get(userIdFromDatabase(USER_A_ID));
    if (stored === undefined) throw new Error('user A not seeded');
    stored.telegramChatId = CHAT_ID_OF_A;
    const response = await callMe({ subject: SUBJECT_A });
    const text = await response.clone().text();
    const data = await readData(response);
    expect(response.status).toBe(200);
    expect(Object.keys(data).sort()).toStrictEqual(PROFILE_KEYS);
    expect(data['telegramLinked']).toBe(true);
    expect(data['id']).toBe(USER_A_ID);
    expect(text).not.toContain(CHAT_ID_OF_A);
    for (const fragment of FORBIDDEN_FRAGMENTS) expect(text).not.toContain(fragment);
    stored.telegramChatId = undefined;
  });

  test('reports telegramLinked false when no chat is linked', async () => {
    const data = await readData(await callMe({ subject: SUBJECT_B }));
    expect(data['telegramLinked']).toBe(false);
    expect(data['displayCurrency']).toBe('BRL');
    expect(data['timezone']).toBe('America/Sao_Paulo');
    expect(data['alertTelegramEnabled']).toBe(true);
    expect(data['displayName']).toBeNull();
  });
});

describe('PATCH /v1/me', () => {
  test('updates the preferences and returns the new profile', async () => {
    const response = await callMe({
      subject: SUBJECT_A,
      method: 'PATCH',
      body: {
        displayName: '  Ana  ',
        displayCurrency: 'USD',
        timezone: 'america/new_york',
        alertTelegramEnabled: false,
      },
    });
    const data = await readData(response);
    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      displayName: 'Ana',
      displayCurrency: 'USD',
      timezone: 'America/New_York',
      alertTelegramEnabled: false,
    });
    expect(await readData(await callMe({ subject: SUBJECT_A }))).toMatchObject({
      displayName: 'Ana',
    });
  });

  test('clears the display name with null', async () => {
    const response = await callMe({
      subject: SUBJECT_A,
      method: 'PATCH',
      body: { displayName: null },
    });
    expect((await readData(response))['displayName']).toBeNull();
  });

  test('rejects unknown fields with every error at once and no echo of values', async () => {
    const response = await callMe({
      subject: SUBJECT_A,
      method: 'PATCH',
      body: {
        userId: USER_B_ID,
        telegramChatId: 'chat-secret-value',
        email: 'attacker@example.test',
        displayCurrency: 'EUR-secret',
        timezone: 'Mars/Olympus-secret',
      },
    });
    const text = await response.text();
    const body = JSON.parse(text) as { error: { code: string; details: { field: string }[] } };
    expect(response.status).toBe(400);
    expect(body.error.code).toBe('REQUEST_VALIDATION_FAILED');
    const fields = body.error.details.map((detail) => detail.field).sort();
    expect(fields).toStrictEqual(['(body)', 'displayCurrency', 'timezone']);
    for (const echoed of [
      'chat-secret-value',
      'attacker@example.test',
      'EUR-secret',
      'Mars',
      USER_B_ID,
    ]) {
      expect(text).not.toContain(echoed);
    }
  });

  test.each([
    ['empty body', {}],
    ['name too long', { displayName: 'x'.repeat(121) }],
    ['blank name', { displayName: '   ' }],
    ['lowercase currency', { displayCurrency: 'brl' }],
    ['numeric timezone offset', { timezone: '+03:00' }],
    ['non boolean alert flag', { alertTelegramEnabled: 'yes' }],
  ])('rejects %s', async (_description, body) => {
    const response = await callMe({ subject: SUBJECT_A, method: 'PATCH', body });
    expect(response.status).toBe(400);
  });

  test('rejects a body that is not JSON', async () => {
    const response = await harness.api.sendThroughHandler({
      path: ME_PATH,
      method: 'PATCH',
      token: await harness.tokenFor(SUBJECT_A),
      body: '{not json',
    });
    expect(response.status).toBe(400);
  });
});

describe('isolation between users', () => {
  test('user B never reads or changes anything of user A', async () => {
    await callMe({
      subject: SUBJECT_A,
      method: 'PATCH',
      body: { displayName: 'Dona A', displayCurrency: 'USD' },
    });
    const before = await readData(await callMe({ subject: SUBJECT_A }));

    await callMe({
      subject: SUBJECT_B,
      method: 'PATCH',
      body: { displayName: 'Dono B', displayCurrency: 'BRL' },
    });
    const forgedOwner = await callMe({
      subject: SUBJECT_B,
      method: 'PATCH',
      body: { userId: USER_A_ID },
    });

    const profileOfB = await readData(await callMe({ subject: SUBJECT_B }));
    expect(profileOfB).toMatchObject({ id: USER_B_ID, displayName: 'Dono B' });
    expect(forgedOwner.status).toBe(400);
    expect(await readData(await callMe({ subject: SUBJECT_A }))).toStrictEqual(before);
  });

  test('the response of each user carries only their own identifier', async () => {
    const profileOfA = await readData(await callMe({ subject: SUBJECT_A }));
    const profileOfB = await readData(await callMe({ subject: SUBJECT_B }));
    expect([profileOfA['id'], profileOfB['id']]).toStrictEqual([USER_A_ID, USER_B_ID]);
  });
});
