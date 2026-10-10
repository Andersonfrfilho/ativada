// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { USER_RESOLUTION_STATUS } from '../packages/database/src/users/user-resolution.constant.js';
import type { UserResolution } from '../packages/database/src/users/resolve-user-by-subject.js';
import { createOwnerScope } from '../packages/database/src/ownership/owner-scope.js';
import { userIdFromDatabase } from '../packages/database/src/ownership/user-id.js';
import {
  CLASSIC_SCOREBOARD_STRATEGY,
  createStrategyVersion,
  hashStrategyConfig,
  parseStrategyConfig,
} from '../packages/strategy-engine/src/index.js';
import { loadApiApp } from './fixtures/api-routes/api-app.fixture.js';
import { createInMemoryStrategies } from './fixtures/api-routes/in-memory-strategies.fixture.js';
import { loadClassicScoreboard } from './fixtures/strategy-engine/engine-scenarios.fixture.js';

const app = await loadApiApp();
const USER_A = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d11';
const USER_B = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d12';
const CLASSIC_CONFIG_HASH = '7dc257e634968692b36421cc67c92a41ccbb17b6138299cc5a50ab246af56df8';
const CONCURRENT_ACCESSES = 20;

function activeResolution(userId: string): UserResolution {
  const id = userIdFromDatabase(userId);
  return { status: USER_RESOLUTION_STATUS.ACTIVE, userId: id, scope: createOwnerScope(id) };
}

describe('Placar clássico: a fonte única de produção é o fixture do contrato', () => {
  test('a configuração e o hash são IDÊNTICOS aos do fixture do plano §4', () => {
    const fixture = createStrategyVersion(loadClassicScoreboard());
    expect(CLASSIC_SCOREBOARD_STRATEGY.version.configHash).toBe(fixture.configHash);
    expect(CLASSIC_SCOREBOARD_STRATEGY.version.configHash).toBe(CLASSIC_CONFIG_HASH);
    expect(CLASSIC_SCOREBOARD_STRATEGY.version.config).toStrictEqual(fixture.config);
  });

  test('a configuração já passa pelo esquema do motor e se reparseia em si mesma', () => {
    const { config, configHash } = CLASSIC_SCOREBOARD_STRATEGY.version;
    expect(parseStrategyConfig(config)).toStrictEqual(config);
    expect(hashStrategyConfig(config)).toBe(configHash);
  });

  test('tem nome e descrição legíveis', () => {
    expect(CLASSIC_SCOREBOARD_STRATEGY.name).toBe('Placar clássico');
    expect(CLASSIC_SCOREBOARD_STRATEGY.description.length).toBeGreaterThan(40);
  });
});

describe('caso de uso de semeadura', () => {
  test('grava a estratégia de exemplo com a configuração e o hash da constante', async () => {
    const store = createInMemoryStrategies();
    const seed = app.seedExample.createSeedExampleStrategyUseCase({
      strategies: store.repository,
    });
    const scope = createOwnerScope(userIdFromDatabase(USER_A));
    expect(await seed(scope)).toBe('seeded');
    const page = await store.repository.listStrategiesPage(scope, { limit: 10, after: undefined });
    expect(page.strategies).toHaveLength(1);
    expect(page.strategies[0]).toMatchObject({ name: 'Placar clássico', isExample: true });
    const versions = store.versionsOf(page.strategies[0]?.id ?? '');
    expect(versions).toHaveLength(1);
    expect(versions[0]?.configHash).toBe(CLASSIC_CONFIG_HASH);
    expect(JSON.stringify(versions[0]?.config)).toBe(
      JSON.stringify(CLASSIC_SCOREBOARD_STRATEGY.version.config),
    );
  });

  test('semeia UMA vez só, mesmo depois de apagar ou editar a estratégia de exemplo', async () => {
    const store = createInMemoryStrategies();
    const seed = app.seedExample.createSeedExampleStrategyUseCase({ strategies: store.repository });
    const scope = createOwnerScope(userIdFromDatabase(USER_A));
    await seed(scope);
    expect(await seed(scope)).toBe('skipped');
    const [example] = await store.repository.listStrategies(scope);
    await store.repository.softDeleteStrategy(scope, example?.id ?? '');
    expect(await seed(scope)).toBe('skipped');
    expect(await store.repository.listStrategies(scope)).toHaveLength(0);
  });

  test('dois usuários recebem cada um a sua cópia, independentes', async () => {
    const store = createInMemoryStrategies();
    const seed = app.seedExample.createSeedExampleStrategyUseCase({ strategies: store.repository });
    const scopeA = createOwnerScope(userIdFromDatabase(USER_A));
    const scopeB = createOwnerScope(userIdFromDatabase(USER_B));
    await seed(scopeA);
    await seed(scopeB);
    const [exampleA] = await store.repository.listStrategies(scopeA);
    const [exampleB] = await store.repository.listStrategies(scopeB);
    expect(exampleA?.id).not.toBe(exampleB?.id);
    await store.repository.softDeleteStrategy(scopeA, exampleA?.id ?? '');
    expect(await store.repository.listStrategies(scopeB)).toHaveLength(1);
  });
});

type SeedCall = { readonly userId: string };

function buildResolver(options: {
  readonly resolutions: Readonly<Record<string, UserResolution>>;
  readonly failures?: { remaining: number };
}): {
  readonly resolve: (subject: string) => Promise<UserResolution>;
  readonly calls: SeedCall[];
  readonly reported: unknown[];
} {
  const calls: SeedCall[] = [];
  const reported: unknown[] = [];
  const resolve = app.seedingResolver.createExampleSeedingUserResolver({
    resolveUser: (subject) =>
      Promise.resolve(options.resolutions[subject] ?? { status: USER_RESOLUTION_STATUS.DELETED }),
    seedExampleStrategy: async (scope) => {
      calls.push({ userId: scope.ownerUserId });
      await Bun.sleep(5);
      if ((options.failures?.remaining ?? 0) > 0) {
        options.failures!.remaining -= 1;
        throw new Error('banco indisponível');
      }
    },
    reportFailure: (error) => reported.push(error),
  });
  return { resolve, calls, reported };
}

describe('semeadura no primeiro acesso (resolução do usuário autenticado)', () => {
  test('o usuário ativo é semeado e a resolução volta intacta', async () => {
    const resolution = activeResolution(USER_A);
    const { resolve, calls } = buildResolver({ resolutions: { a: resolution } });
    expect(await resolve('a')).toBe(resolution);
    expect(calls).toStrictEqual([{ userId: USER_A }]);
  });

  test('20 primeiros acessos SIMULTÂNEOS do mesmo usuário disparam uma semeadura só', async () => {
    const { resolve, calls } = buildResolver({ resolutions: { a: activeResolution(USER_A) } });
    await Promise.all(Array.from({ length: CONCURRENT_ACCESSES }, () => resolve('a')));
    expect(calls).toHaveLength(1);
  });

  test('depois de semeado, os acessos seguintes não tocam o banco de novo', async () => {
    const { resolve, calls } = buildResolver({ resolutions: { a: activeResolution(USER_A) } });
    await resolve('a');
    await resolve('a');
    await resolve('a');
    expect(calls).toHaveLength(1);
  });

  test('conta bloqueada ou apagada não é semeada', async () => {
    const { resolve, calls, reported } = buildResolver({
      resolutions: {
        blocked: { status: USER_RESOLUTION_STATUS.BLOCKED },
        deleted: { status: USER_RESOLUTION_STATUS.DELETED },
      },
    });
    expect((await resolve('blocked')).status).toBe(USER_RESOLUTION_STATUS.BLOCKED);
    expect((await resolve('deleted')).status).toBe(USER_RESOLUTION_STATUS.DELETED);
    expect(calls).toHaveLength(0);
    expect(reported).toHaveLength(0);
  });

  test('falha na semeadura NUNCA derruba o login: registra e tenta de novo no próximo acesso', async () => {
    const failures = { remaining: 1 };
    const resolution = activeResolution(USER_A);
    const { resolve, calls, reported } = buildResolver({
      resolutions: { a: resolution },
      failures,
    });
    expect(await resolve('a')).toBe(resolution);
    expect(reported).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(await resolve('a')).toBe(resolution);
    expect(calls).toHaveLength(2);
    expect(reported).toHaveLength(1);
    await resolve('a');
    expect(calls).toHaveLength(2);
  });

  test('a falha registrada é só o erro, sem dado do usuário', async () => {
    const { resolve, reported } = buildResolver({
      resolutions: { a: activeResolution(USER_A) },
      failures: { remaining: 1 },
    });
    await resolve('a');
    expect(JSON.stringify(reported)).not.toContain('"a"');
    expect(reported[0]).toBeInstanceOf(Error);
  });

  test('usuários diferentes são semeados cada um por si', async () => {
    const { resolve, calls } = buildResolver({
      resolutions: { a: activeResolution(USER_A), b: activeResolution(USER_B) },
    });
    await Promise.all([resolve('a'), resolve('b'), resolve('a')]);
    expect(calls.map((call) => call.userId).sort()).toStrictEqual([USER_A, USER_B]);
  });
});
