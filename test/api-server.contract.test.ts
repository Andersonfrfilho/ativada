// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { startServer, type StartedServer } from '../apps/api-crypto/src/server.js';
import { createShutdownHandler } from '../apps/api-crypto/src/shutdown.js';
import { createApiHarness, type ApiHarness } from './fixtures/api-harness.fixture.js';
import { readEnvironmentFile } from './fixtures/environment-file.fixture.js';
import { createLogger } from '../apps/api-crypto/src/logging/logger.js';

const REPOSITORY_ROOT: string = new URL('../', import.meta.url).pathname;
const LISTENING_MESSAGE = '"message":"listening"';
const STARTUP_TIMEOUT_MILLISECONDS = 20_000;

let harness: ApiHarness | undefined;
let server: StartedServer | undefined;

afterEach(async () => {
  await server?.stop();
  await harness?.stop();
  server = undefined;
  harness = undefined;
});

async function readUntil(stream: ReadableStream<Uint8Array>, marker: string): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const deadline = Date.now() + STARTUP_TIMEOUT_MILLISECONDS;
  while (!text.includes(marker) && Date.now() < deadline) {
    const chunk = await reader.read();
    if (chunk.done) break;
    text += decoder.decode(chunk.value);
  }
  reader.releaseLock();
  return text;
}

describe('Bun.serve wiring', () => {
  test('serves /v1/health over real HTTP with the security headers', async () => {
    harness = await createApiHarness();
    server = startServer({ handler: harness.handler, host: '127.0.0.1', port: 0 });
    const response = await fetch(`http://127.0.0.1:${server.port}/v1/test/public`);
    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ data: { reached: true } });
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });

  test('answers a protected route without token with 401 over real HTTP', async () => {
    harness = await createApiHarness();
    server = startServer({ handler: harness.handler, host: '127.0.0.1', port: 0 });
    const response = await fetch(`http://127.0.0.1:${server.port}/v1/test/user`);
    expect(response.status).toBe(401);
  });

  test('binds only to the requested host', async () => {
    harness = await createApiHarness();
    server = startServer({ handler: harness.handler, host: '127.0.0.1', port: 0 });
    const response = await fetch(`http://127.0.0.1:${server.port}/v1/missing`);
    expect(response.status).toBe(404);
  });
});

describe('graceful shutdown', () => {
  function createShutdownFixture(overrides: { readonly closeFails?: boolean } = {}): {
    readonly exits: number[];
    readonly steps: string[];
    readonly shutdown: (signal: string) => Promise<void>;
  } {
    const exits: number[] = [];
    const steps: string[] = [];
    const shutdown = createShutdownHandler({
      stopServer: () => Promise.resolve(void steps.push('stop-server')),
      closeResources: () => {
        steps.push('close-resources');
        return overrides.closeFails === true
          ? Promise.reject(new Error('close failed'))
          : Promise.resolve();
      },
      logger: createLogger({ appName: 'api-crypto', write: () => undefined }),
      timeoutMilliseconds: 5000,
      exit: (code: number): void => void exits.push(code),
    });
    return { exits, steps, shutdown };
  }

  test('stops the server, closes resources, then exits 0', async () => {
    const { exits, steps, shutdown } = createShutdownFixture();
    await shutdown('SIGTERM');
    expect(steps).toStrictEqual(['stop-server', 'close-resources']);
    expect(exits).toStrictEqual([0]);
  });

  test('runs only once when signalled twice', async () => {
    const { exits, shutdown } = createShutdownFixture();
    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);
    expect(exits).toStrictEqual([0]);
  });

  test('exits 1 when closing resources fails', async () => {
    const { exits, shutdown } = createShutdownFixture({ closeFails: true });
    await shutdown('SIGTERM');
    expect(exits).toStrictEqual([1]);
  });

  test('forces exit 1 when draining takes longer than the timeout', async () => {
    const exits: number[] = [];
    const shutdown = createShutdownHandler({
      stopServer: () => new Promise<void>(() => undefined),
      closeResources: () => Promise.resolve(),
      logger: createLogger({ appName: 'api-crypto', write: () => undefined }),
      timeoutMilliseconds: 50,
      exit: (code: number): void => void exits.push(code),
    });
    void shutdown('SIGTERM');
    await Bun.sleep(150);
    expect(exits).toStrictEqual([1]);
  });
});

describe('main.ts as a real process', () => {
  test('boots, serves, and exits 0 on SIGTERM', async () => {
    const environment = await readEnvironmentFile('env.test');
    const child = Bun.spawn([process.execPath, 'run', 'apps/api-crypto/src/main.ts'], {
      cwd: REPOSITORY_ROOT,
      env: { ...environment },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const startupOutput = await readUntil(child.stdout, LISTENING_MESSAGE);
    expect(startupOutput).toContain(LISTENING_MESSAGE);
    const response = await fetch(`http://127.0.0.1:${environment['API_PORT']}/v1/health`);
    expect(response.status).toBe(200);
    child.kill('SIGTERM');
    const exitCode = await child.exited;
    expect(exitCode).toBe(0);
  });
});
