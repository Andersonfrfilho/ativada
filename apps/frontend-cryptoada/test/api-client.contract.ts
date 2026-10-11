// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { HTTP_STATUS, z } from '@cryptoada/environment';

import { ApiError, ResponseShapeError } from '../src/http/api.error.js';
import { createApiClient } from '../src/http/api-client.js';
import { createSessionService } from '../src/session/session-service.js';
import {
  createFakeAccessToken,
  createFakeFetch,
  dataResponse,
  errorResponse,
  jsonResponse,
  pageResponse,
  captureRejection,
  type FakeResponder,
  type FakeRoute,
} from './support/fake-fetch.js';

const ITEM_PATH = '/v1/thing';
const itemSchema = z.object({ id: z.string() });

function buildClient(routes: readonly FakeRoute[]): {
  readonly client: ReturnType<typeof createApiClient>;
  readonly session: ReturnType<typeof createSessionService>;
  readonly calls: ReturnType<typeof createFakeFetch>;
} {
  let issued = 0;
  const refresh: FakeRoute = {
    method: 'POST',
    path: '/v1/session/refresh',
    respond: (): Response =>
      dataResponse({ accessToken: createFakeAccessToken({ n: (issued += 1) }), expiresIn: 300 }),
  };
  const calls = createFakeFetch([refresh, ...routes]);
  const session = createSessionService({ fetchImplementation: calls.fetch, now: () => 0 });
  return { client: createApiClient({ fetchImplementation: calls.fetch, session }), session, calls };
}

function thingRoute(respond: FakeResponder, method = 'GET'): FakeRoute {
  return { method, path: ITEM_PATH, respond };
}

describe('api client errors with details', () => {
  test('keeps the field and reason of each validation problem', async () => {
    const { client } = buildClient([
      thingRoute(() =>
        jsonResponse(
          {
            error: {
              code: 'REQUEST_VALIDATION_FAILED',
              message: 'Corpo inválido.',
              details: [
                { field: 'runParameters.feeRate', reason: 'invalid_value' },
                { field: 'periodEnd', reason: 'must_be_after_period_start' },
              ],
            },
          },
          400,
        ),
      ),
    ]);
    const failure = await captureRejection(client.request({ path: ITEM_PATH, schema: itemSchema }));
    expect(failure instanceof ApiError ? failure.details : []).toEqual([
      { field: 'runParameters.feeRate', reason: 'invalid_value' },
      { field: 'periodEnd', reason: 'must_be_after_period_start' },
    ]);
  });
});

describe('api client', () => {
  test('sends the bearer token and the CSRF header, and returns validated data', async () => {
    const { client, calls } = buildClient([thingRoute(() => dataResponse({ id: 'a' }))]);
    expect(await client.request({ path: ITEM_PATH, schema: itemSchema })).toEqual({ id: 'a' });
    const [call] = calls.callsTo('GET', ITEM_PATH);
    expect(call?.headers.get('Authorization')).toStartWith('Bearer ');
    expect(call?.headers.get('X-Requested-With')).toBe('fetch');
  });

  test('sends a JSON body with its content type', async () => {
    const { client, calls } = buildClient([thingRoute(() => dataResponse({ id: 'b' }), 'PATCH')]);
    await client.request({ method: 'PATCH', path: ITEM_PATH, body: { a: 1 }, schema: itemSchema });
    const [call] = calls.callsTo('PATCH', ITEM_PATH);
    expect(call?.body).toEqual({ a: 1 });
    expect(call?.headers.get('Content-Type')).toBe('application/json');
  });

  test('renews once and retries when the API answers 401, with the new token', async () => {
    let attempts = 0;
    const { client, calls } = buildClient([
      thingRoute(() =>
        (attempts += 1) === 1
          ? errorResponse(HTTP_STATUS.UNAUTHORIZED, 'TOKEN_EXPIRED')
          : dataResponse({ id: 'c' }),
      ),
    ]);
    expect(await client.request({ path: ITEM_PATH, schema: itemSchema })).toEqual({ id: 'c' });
    const tokens = calls.callsTo('GET', ITEM_PATH).map((call) => call.headers.get('Authorization'));
    expect(tokens[0]).not.toBe(tokens[1]);
    expect(calls.callsTo('POST', '/v1/session/refresh')).toHaveLength(2);
  });

  test('a second 401 ends the local session and throws an authentication error', async () => {
    const { client, session } = buildClient([
      thingRoute(() => errorResponse(HTTP_STATUS.UNAUTHORIZED, 'TOKEN_INVALID')),
    ]);
    const failure = await captureRejection(client.request({ path: ITEM_PATH, schema: itemSchema }));
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure instanceof ApiError ? failure.status : 0).toBe(HTTP_STATUS.UNAUTHORIZED);
    expect(session.getSnapshot()).toBe('anonymous');
  });

  test('turns an error envelope into an ApiError carrying the stable code', async () => {
    const { client } = buildClient([
      thingRoute(() => errorResponse(HTTP_STATUS.CONFLICT, 'SOMETHING_CONFLICTED')),
    ]);
    const failure = await captureRejection(client.request({ path: ITEM_PATH, schema: itemSchema }));
    expect(failure instanceof ApiError ? failure.code : '').toBe('SOMETHING_CONFLICTED');
  });

  test('rejects a response that does not match the schema', async () => {
    const { client } = buildClient([thingRoute(() => dataResponse({ id: 42 }))]);
    const failure = await captureRejection(client.request({ path: ITEM_PATH, schema: itemSchema }));
    expect(failure).toBeInstanceOf(ResponseShapeError);
  });

  test('reads a page with its next cursor', async () => {
    const { client } = buildClient([thingRoute(() => pageResponse([{ id: 'a' }], 'next'))]);
    const page = await client.requestPage({ path: ITEM_PATH, schema: itemSchema });
    expect(page).toEqual({ items: [{ id: 'a' }], nextCursor: 'next' });
  });

  test('does not call the API at all when there is no session', async () => {
    const calls = createFakeFetch([
      {
        method: 'POST',
        path: '/v1/session/refresh',
        respond: (): Response => errorResponse(HTTP_STATUS.UNAUTHORIZED, 'SESSION_INVALID'),
      },
      thingRoute(() => dataResponse({ id: 'x' })),
    ]);
    const session = createSessionService({ fetchImplementation: calls.fetch, now: () => 0 });
    const client = createApiClient({ fetchImplementation: calls.fetch, session });
    const failure = await captureRejection(client.request({ path: ITEM_PATH, schema: itemSchema }));
    expect(failure).toBeInstanceOf(ApiError);
    expect(calls.callsTo('GET', ITEM_PATH)).toHaveLength(0);
  });

  test('downloads a file with the name from Content-Disposition', async () => {
    const { client } = buildClient([
      thingRoute(
        () =>
          new Response('{"data":{}}', {
            headers: {
              'Content-Disposition': 'attachment; filename="cryptoada-export-2026-10-11.json"',
            },
          }),
      ),
    ]);
    const file = await client.download(ITEM_PATH);
    expect(file.fileName).toBe('cryptoada-export-2026-10-11.json');
    expect(await file.blob.text()).toBe('{"data":{}}');
  });
});
