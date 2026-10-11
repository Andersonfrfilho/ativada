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
    expect(await session.end()).toEqual({ isConfirmed: false });
    expect(session.getSnapshot()).toBe('anonymous');
    expect(session.hasUnconfirmedSignOut()).toBe(true);
  });

  test('a confirmed sign-out leaves no warning', async () => {
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
    expect(await session.end()).toEqual({ isConfirmed: true });
    expect(session.hasUnconfirmedSignOut()).toBe(false);
  });
});

describe('transient renewal failure while the token is still good', () => {
  const REAL_EXPIRY = LIFETIME_SECONDS * 1_000;
  const INSIDE_MARGIN = REAL_EXPIRY - 10_000;

  function setup(): {
    readonly session: ReturnType<typeof createSessionService>;
    readonly clock: { now: number };
    readonly mode: { transient: boolean };
    readonly token: string;
  } {
    const token = createFakeAccessToken({ email: EMAIL });
    const mode = { transient: false };
    const clock = { now: 0 };
    const fake = createFakeFetch([
      refreshRoute(() => (mode.transient ? errorResponse(503, 'DOWN') : tokenResponse(token))),
    ]);
    const session = createSessionService({
      fetchImplementation: fake.fetch,
      now: () => clock.now,
    });
    return { session, clock, mode, token };
  }

  test('keeps the session authenticated and the credentials, and flags the renewal problem', async () => {
    const { session, clock, mode, token } = setup();
    await session.getAccessToken();
    mode.transient = true;
    clock.now = INSIDE_MARGIN;
    expect(await session.getAccessToken()).toBe(token);
    expect(session.getSnapshot()).toBe('authenticated');
    expect(session.hasRenewalProblem()).toBe(true);
  });

  test('a later successful renewal clears the flag', async () => {
    const { session, clock, mode } = setup();
    await session.getAccessToken();
    mode.transient = true;
    clock.now = INSIDE_MARGIN;
    await session.getAccessToken();
    mode.transient = false;
    await session.renew();
    expect(session.hasRenewalProblem()).toBe(false);
    expect(session.getSnapshot()).toBe('authenticated');
  });

  test('only when the token really expires without renewal does the session become unavailable', async () => {
    const { session, clock, mode } = setup();
    await session.getAccessToken();
    mode.transient = true;
    clock.now = REAL_EXPIRY + 1_000;
    expect(await session.getAccessToken()).toBeUndefined();
    expect(session.getSnapshot()).toBe('unavailable');
    expect(session.hasRenewalProblem()).toBe(false);
  });

  test('a definitive refusal (401) still logs out at once', async () => {
    const token = createFakeAccessToken({});
    let calls = 0;
    const fake = createFakeFetch([
      refreshRoute(() =>
        (calls += 1) === 1 ? tokenResponse(token) : errorResponse(401, 'SESSION_INVALID'),
      ),
    ]);
    const clock = { now: 0 };
    const session = createSessionService({ fetchImplementation: fake.fetch, now: () => clock.now });
    await session.getAccessToken();
    clock.now = INSIDE_MARGIN;
    expect(await session.getAccessToken()).toBeUndefined();
    expect(session.getSnapshot()).toBe('anonymous');
  });
});

describe('a slow refresh must not undo a newer login', () => {
  test('the code exchange that started later wins, even if the older refresh answers 401 afterwards', async () => {
    const token = createFakeAccessToken({ email: EMAIL });
    let releaseRefresh: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    const fake = createFakeFetch([
      refreshRoute(async () => {
        await gate;
        return errorResponse(HTTP_STATUS.UNAUTHORIZED, 'SESSION_INVALID');
      }),
      { method: 'POST', path: SESSION_PATH, respond: (): Response => tokenResponse(token) },
    ]);
    const session = createSessionService({ fetchImplementation: fake.fetch, now: () => 0 });
    const slowRefresh = session.renew();
    await session.exchangeCode({ code: 'c', codeVerifier: 'v', redirectUri: 'http://x/cb' });
    expect(session.getSnapshot()).toBe('authenticated');
    releaseRefresh();
    await slowRefresh;
    expect(session.getSnapshot()).toBe('authenticated');
    expect(session.readEmail()).toBe(EMAIL);
  });
});
