// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { TestSigningKey } from './token-signing.fixture.js';

export const JWKS_SERVER_MODE = {
  OK: 'ok',
  DOWN: 'down',
  SLOW: 'slow',
  GARBAGE: 'garbage',
} as const;

export type JwksServerMode = (typeof JWKS_SERVER_MODE)[keyof typeof JWKS_SERVER_MODE];

export type JwksTestServer = {
  readonly url: string;
  readonly setMode: (mode: JwksServerMode) => void;
  readonly publishKey: (key: TestSigningKey) => void;
  readonly requestCount: () => number;
  readonly stop: () => Promise<void>;
};

const SLOW_RESPONSE_DELAY_MILLISECONDS = 2000;
const HTTP_SERVER_ERROR = 500;

export function startJwksTestServer(initialKeys: readonly TestSigningKey[]): JwksTestServer {
  const publishedKeys = [...initialKeys];
  let mode: JwksServerMode = JWKS_SERVER_MODE.OK;
  let requests = 0;

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(): Promise<Response> {
      requests += 1;
      if (mode === JWKS_SERVER_MODE.DOWN)
        return new Response('down', { status: HTTP_SERVER_ERROR });
      if (mode === JWKS_SERVER_MODE.GARBAGE) return new Response('<html>not json</html>');
      if (mode === JWKS_SERVER_MODE.SLOW) {
        await Bun.sleep(SLOW_RESPONSE_DELAY_MILLISECONDS);
      }
      return Response.json({ keys: publishedKeys.map((key) => key.publicJwk) });
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}/certs`,
    setMode: (nextMode: JwksServerMode): void => {
      mode = nextMode;
    },
    publishKey: (key: TestSigningKey): void => {
      publishedKeys.push(key);
    },
    requestCount: (): number => requests,
    stop: async (): Promise<void> => {
      await server.stop(true);
    },
  };
}
