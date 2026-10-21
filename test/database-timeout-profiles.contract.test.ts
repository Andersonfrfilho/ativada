// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  backtestWorkerEnvironmentSchema,
  environmentSchema as apiEnvironmentSchema,
  walkForwardWorkerEnvironmentSchema,
} from '../apps/api-ativada/src/environment.js';
import { environmentSchema as cronEnvironmentSchema } from '../apps/cron-ativada/src/environment.js';
import { environmentSchema as workerEnvironmentSchema } from '../apps/worker-ativada/src/environment.js';
import { createFlakyServer } from '../packages/database/test-support/flaky-sql.js';
import { EnvironmentError, parseEnvironment } from '../packages/environment/src/index.js';
import { createResilientDatabase } from '../packages/database/src/connection/resilient-database.js';
import { readEnvironmentFile } from './fixtures/environment-file.fixture.js';

const SHORT_PROFILE_SECONDS = 30;
const LONG_PROFILE_SECONDS = 600;
const UNIT_SECONDS = 45;
// Os segundos viram milissegundos: a proporção entre o teto e a unidade é a mesma, sem esperar 45 s de verdade.
const SECONDS_TO_TEST_MILLISECONDS = 1;
const LONG_VARIABLE = 'DATABASE_LONG_QUERY_TIMEOUT_SECONDS';

async function runUnitOfSeconds(ceilingSeconds: number): Promise<string> {
  const server = createFlakyServer();
  const database = createResilientDatabase({
    openClient: () => server.openClient(),
    queryTimeoutMilliseconds: ceilingSeconds * SECONDS_TO_TEST_MILLISECONDS,
    confirmTimeoutMilliseconds: 20,
    now: () => Date.now(),
    random: () => 0,
    failureThreshold: 2,
    reconnectBaseMilliseconds: 1_000,
    reconnectMaxMilliseconds: 30_000,
  });
  try {
    return await database.begin(async () => {
      await Bun.sleep(UNIT_SECONDS * SECONDS_TO_TEST_MILLISECONDS);
      return 'done';
    });
  } catch (error: unknown) {
    return error instanceof Error ? error.message : 'unknown';
  } finally {
    await database.close();
  }
}

describe('teto por unidade: perfil curto (API e worker) e perfil longo (cron e threads)', () => {
  test('API e worker ficam em 30 s; cron e as duas threads, em 600 s', async () => {
    const base = await readEnvironmentFile('env.test');
    expect(parseEnvironment(apiEnvironmentSchema, base).DATABASE_QUERY_TIMEOUT_SECONDS).toBe(
      SHORT_PROFILE_SECONDS,
    );
    expect(parseEnvironment(workerEnvironmentSchema, base).DATABASE_QUERY_TIMEOUT_SECONDS).toBe(
      SHORT_PROFILE_SECONDS,
    );
    expect(parseEnvironment(apiEnvironmentSchema, base)[LONG_VARIABLE]).toBe(LONG_PROFILE_SECONDS);
    expect(parseEnvironment(cronEnvironmentSchema, base)[LONG_VARIABLE]).toBe(LONG_PROFILE_SECONDS);
    expect(parseEnvironment(backtestWorkerEnvironmentSchema, base)[LONG_VARIABLE]).toBe(
      LONG_PROFILE_SECONDS,
    );
    expect(parseEnvironment(walkForwardWorkerEnvironmentSchema, base)[LONG_VARIABLE]).toBe(
      LONG_PROFILE_SECONDS,
    );
  });

  test('o valor explícito vale e o perfil longo recusa o que está fora de 30 a 3600', async () => {
    const base = await readEnvironmentFile('env.test');
    expect(
      parseEnvironment(cronEnvironmentSchema, { ...base, [LONG_VARIABLE]: '1200' })[LONG_VARIABLE],
    ).toBe(1200);
    for (const value of ['29', '3601', '1.5', 'abc', '']) {
      expect(() =>
        parseEnvironment(cronEnvironmentSchema, { ...base, [LONG_VARIABLE]: value }),
      ).toThrow(EnvironmentError);
    }
  });

  test('uma unidade de 45 s é abortada no perfil da API e NÃO é abortada no perfil do cron', async () => {
    expect(await runUnitOfSeconds(SHORT_PROFILE_SECONDS)).toBe('Database query timed out');
    expect(await runUnitOfSeconds(LONG_PROFILE_SECONDS)).toBe('done');
  });
});
