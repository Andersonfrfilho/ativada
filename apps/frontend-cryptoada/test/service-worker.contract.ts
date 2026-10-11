// Copyright (c) 2026 Ada Technology. All rights reserved.
import { runInNewContext } from 'node:vm';

import { describe, expect, test } from 'bun:test';

const SERVICE_WORKER_URL = new URL('../public/sw.js', import.meta.url).pathname;

type FetchEventStub = {
  readonly request: { readonly method: string; readonly url: string; readonly mode: string };
  readonly respondWith: (response: unknown) => void;
};

async function dispatchFetch(request: FetchEventStub['request']): Promise<boolean> {
  const listeners = new Map<string, (event: unknown) => void>();
  const stubSelf = {
    location: { origin: 'http://127.0.0.1:56103' },
    addEventListener: (type: string, listener: (event: unknown) => void): void => {
      listeners.set(type, listener);
    },
    clients: { claim: (): Promise<void> => Promise.resolve() },
    skipWaiting: (): void => undefined,
  };
  const stubCaches = {
    match: (): Promise<undefined> => Promise.resolve(undefined),
    open: (): Promise<unknown> => Promise.resolve({ addAll: () => Promise.resolve() }),
    keys: (): Promise<string[]> => Promise.resolve([]),
    delete: (): Promise<boolean> => Promise.resolve(true),
  };
  const source = await Bun.file(SERVICE_WORKER_URL).text();
  runInNewContext(source, {
    self: stubSelf,
    caches: stubCaches,
    fetch: () => Promise.resolve(new Response('ok')),
    URL,
  });
  let responded = false;
  listeners.get('fetch')?.({
    request,
    respondWith: (): void => void (responded = true),
  } satisfies FetchEventStub);
  return responded;
}

describe('service worker', () => {
  test('never answers requests to the API (data and session are not cached)', async () => {
    for (const path of ['/v1/me', '/v1/session/refresh', '/v1/stream']) {
      const responded = await dispatchFetch({
        method: 'GET',
        url: `http://127.0.0.1:56103${path}`,
        mode: 'cors',
      });
      expect(responded).toBe(false);
    }
  });

  test('never answers non-GET requests nor other origins', async () => {
    expect(
      await dispatchFetch({ method: 'POST', url: 'http://127.0.0.1:56103/', mode: 'cors' }),
    ).toBe(false);
    expect(
      await dispatchFetch({ method: 'GET', url: 'https://example.com/a.js', mode: 'cors' }),
    ).toBe(false);
  });

  test('answers navigations and static assets of the shell', async () => {
    expect(
      await dispatchFetch({ method: 'GET', url: 'http://127.0.0.1:56103/conta', mode: 'navigate' }),
    ).toBe(true);
  });
});
