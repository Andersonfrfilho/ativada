// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { HTTP_STATUS } from '@cryptoada/environment';

import { createSessionService } from '../src/session/session-service.js';
import {
  captureRejection,
  createFakeAccessToken,
  createFakeFetch,
  dataResponse,
  errorResponse,
  type FakeRoute,
} from './support/fake-fetch.js';

const REFRESH_PATH = '/v1/session/refresh';
const SESSION_PATH = '/v1/session';
const EMAIL = 'pessoa@example.com';
const LIFETIME_SECONDS = 300;

function tokenResponse(accessToken: string): Response {
  return dataResponse({ accessToken, expiresIn: LIFETIME_SECONDS });
}

function refreshRoute(respond: FakeRoute['respond']): FakeRoute {
  return { method: 'POST', path: REFRESH_PATH, respond };
}

describe('session service', () => {
  test('starts loading and becomes authenticated when the refresh cookie is accepted', async () => {
    const token = createFakeAccessToken({ email: EMAIL });
    const fake = createFakeFetch([refreshRoute(() => tokenResponse(token))]);
    const session = createSessionService({ fetchImplementation: fake.fetch, now: () => 0 });
    expect(session.getSnapshot()).toBe('loading');
    expect(await session.getAccessToken()).toBe(token);
    expect(session.getSnapshot()).toBe('authenticated');
    expect(session.readEmail()).toBe(EMAIL);
  });

  test('becomes anonymous when there is no valid refresh cookie', async () => {
    const fake = createFakeFetch([
      refreshRoute(() => errorResponse(HTTP_STATUS.UNAUTHORIZED, 'SESSION_INVALID')),
    ]);
    const session = createSessionService({ fetchImplementation: fake.fetch, now: () => 0 });
    expect(await session.getAccessToken()).toBeUndefined();
    expect(session.getSnapshot()).toBe('anonymous');
  });

  test('is unavailable, not logged out, when the network fails', async () => {
    const session = createSessionService({
      fetchImplementation: () => Promise.reject(new TypeError('network down')),
      now: () => 0,
    });
    expect(await session.getAccessToken()).toBeUndefined();
    expect(session.getSnapshot()).toBe('unavailable');
  });

  for (const status of [429, 500, 503]) {
    test(`is unavailable, not logged out, when the refresh answers ${status}`, async () => {
      const fake = createFakeFetch([refreshRoute(() => errorResponse(status, 'TRANSIENT'))]);
      const session = createSessionService({ fetchImplementation: fake.fetch, now: () => 0 });
      expect(await session.getAccessToken()).toBeUndefined();
      expect(session.getSnapshot()).toBe('unavailable');
    });
  }

  test('renews one request at a time: parallel callers share the same refresh', async () => {
    const fake = createFakeFetch([refreshRoute(() => tokenResponse(createFakeAccessToken({})))]);
    const session = createSessionService({ fetchImplementation: fake.fetch, now: () => 0 });
    const tokens = await Promise.all([
      session.getAccessToken(),
      session.getAccessToken(),
      session.getAccessToken(),
      session.renew(),
    ]);
    expect(new Set(tokens).size).toBe(1);
    expect(fake.callsTo('POST', REFRESH_PATH)).toHaveLength(1);
  });

  test('reuses the token while it is fresh and refreshes again after it expires', async () => {
    let current = 0;
    let issued = 0;
    const fake = createFakeFetch([
      refreshRoute(() => tokenResponse(createFakeAccessToken({ n: (issued += 1) }))),
    ]);
    const session = createSessionService({ fetchImplementation: fake.fetch, now: () => current });
    const first = await session.getAccessToken();
    current = 100_000;
    expect(await session.getAccessToken()).toBe(first);
    current = LIFETIME_SECONDS * 1000;
    expect(await session.getAccessToken()).not.toBe(first);
    expect(fake.callsTo('POST', REFRESH_PATH)).toHaveLength(2);
  });

  test('sends the CSRF header and no body on refresh, and never touches web storage', async () => {
    const fake = createFakeFetch([refreshRoute(() => tokenResponse(createFakeAccessToken({})))]);
    const session = createSessionService({ fetchImplementation: fake.fetch, now: () => 0 });
    await session.getAccessToken();
    const [call] = fake.callsTo('POST', REFRESH_PATH);
    expect(call?.headers.get('X-Requested-With')).toBe('fetch');
    expect(call?.body).toBeUndefined();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  test('exchanges the authorization code with PKCE data and becomes authenticated', async () => {
    const token = createFakeAccessToken({ email: EMAIL });
    const fake = createFakeFetch([
      { method: 'POST', path: SESSION_PATH, respond: (): Response => tokenResponse(token) },
    ]);
    const session = createSessionService({ fetchImplementation: fake.fetch, now: () => 0 });
    const exchange = {
      code: 'abc',
      codeVerifier: 'v'.repeat(64),
      redirectUri: 'http://x/auth/callback',
    };
    await session.exchangeCode(exchange);
    expect(fake.callsTo('POST', SESSION_PATH)[0]?.body).toEqual(exchange);
    expect(fake.callsTo('POST', SESSION_PATH)[0]?.headers.get('X-Requested-With')).toBe('fetch');
    expect(session.getSnapshot()).toBe('authenticated');
  });

  test('a failed code exchange throws and leaves the session anonymous', async () => {
    const fake = createFakeFetch([
      {
        method: 'POST',
        path: SESSION_PATH,
        respond: (): Response => errorResponse(HTTP_STATUS.BAD_REQUEST, 'SESSION_REQUEST_INVALID'),
      },
    ]);
    const session = createSessionService({ fetchImplementation: fake.fetch, now: () => 0 });
    const exchange = { code: 'abc', codeVerifier: 'v'.repeat(64), redirectUri: 'http://x/cb' };
    expect(await captureRejection(session.exchangeCode(exchange))).toBeInstanceOf(Error);
    expect(session.getSnapshot()).toBe('anonymous');
  });

  test('ending the session calls DELETE, forgets the token and notifies subscribers', async () => {
    const fake = createFakeFetch([
      refreshRoute(() => tokenResponse(createFakeAccessToken({}))),
      {
        method: 'DELETE',
        path: SESSION_PATH,
        respond: (): Response => new Response(null, { status: 204 }),
      },
    ]);
    const session = createSessionService({ fetchImplementation: fake.fetch, now: () => 0 });
    await session.getAccessToken();
    let notifications = 0;
    session.subscribe(() => void (notifications += 1));
    await session.end();
    expect(fake.callsTo('DELETE', SESSION_PATH)).toHaveLength(1);
    expect(session.getSnapshot()).toBe('anonymous');
    expect(notifications).toBeGreaterThan(0);
  });

  test('ending the session still clears locally when the server call fails', async () => {
    const fake = createFakeFetch([
      refreshRoute(() => tokenResponse(createFakeAccessToken({}))),
      {
        method: 'DELETE',
        path: SESSION_PATH,
        respond: (): Response =>
          errorResponse(HTTP_STATUS.SERVICE_UNAVAILABLE, 'SESSION_UNAVAILABLE'),
      },
    ]);
    const session = createSessionService({ fetchImplementation: fake.fetch, now: () => 0 });
    await session.getAccessToken();
    await session.end();
    expect(session.getSnapshot()).toBe('anonymous');
  });
});
