// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createStrategyRepository } from '../src/strategies/strategy.repository.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import { hashOf, resolvePersistenceOwner } from './persistence-seed.js';

const STRATEGY_COUNT = 5;
const VERSION_COUNT = 4;
const PAGE_SIZE = 2;
const OVER_THE_CEILING = 5_000;

async function checkAtomicCreation(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-strategy-page-owner');
  const strategies = createStrategyRepository(handle);
  const created = await strategies.createStrategyWithFirstVersion(owner.scope, {
    name: 'Atômica',
    isExample: false,
    config: { schemaVersion: 1, nonce: 'atomic' },
    configHash: hashOf('atomic'),
  });
  assertCondition(created.version.version === 1, 'a versão criada junto é a 1');
  assertCondition(created.version.strategyId === created.strategy.id, 'a versão é da estratégia');
  const failed = await strategies
    .createStrategyWithFirstVersion(owner.scope, {
      name: 'Nunca deve existir',
      isExample: false,
      config: { schemaVersion: 1 },
      configHash: 'curto',
    })
    .then(
      () => false,
      () => true,
    );
  const leftovers: unknown =
    await client`SELECT count(*)::int AS total FROM strategies WHERE name = 'Nunca deve existir'`;
  assertCondition(failed, 'versão inválida deve falhar');
  assertCondition(
    (leftovers as readonly { total: number }[])[0]?.total === 0,
    'falhou na versão: a estratégia também foi desfeita (mesma transação)',
  );
  reportCheck(
    'estratégia + versão 1 na MESMA transação: falha na versão não deixa estratégia órfã',
  );
}

async function checkStrategyPagination(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-strategy-page-owner');
  const other = await resolvePersistenceOwner(handle, 'subject-strategy-page-other');
  const strategies = createStrategyRepository(handle);
  const created: string[] = [];
  for (let index = 0; index < STRATEGY_COUNT; index += 1) {
    const result = await strategies.createStrategyWithFirstVersion(owner.scope, {
      name: `Página ${index}`,
      isExample: false,
      config: { schemaVersion: 1, nonce: `page-${index}` },
      configHash: hashOf(`page-${index}`),
    });
    created.push(result.strategy.id);
  }
  await strategies.createStrategy(other.scope, { name: 'Do outro', isExample: false });
  const seen: string[] = [];
  let after = undefined as { createdAt: string; id: string } | undefined;
  for (;;) {
    const page = await strategies.listStrategiesPage(owner.scope, { limit: PAGE_SIZE, after });
    assertCondition(page.strategies.length <= PAGE_SIZE, 'a página respeita o limite');
    seen.push(...page.strategies.map((strategy) => strategy.id));
    if (page.nextCursor === undefined) break;
    after = page.nextCursor;
  }
  const ownerIds = seen.filter((id) => created.includes(id));
  assertCondition(ownerIds.join() === [...created].reverse().join(), 'da mais nova à mais antiga');
  assertCondition(new Set(seen).size === seen.length, 'nenhuma estratégia repetida entre páginas');
  const foreign = await strategies.listStrategiesPage(other.scope, {
    limit: 100,
    after: undefined,
  });
  assertCondition(
    foreign.strategies.every((strategy) => !created.includes(strategy.id)),
    'a listagem de B nunca contém estratégia de A',
  );
  const clamped = await strategies.listStrategiesPage(owner.scope, {
    limit: OVER_THE_CEILING,
    after: undefined,
  });
  assertCondition(clamped.strategies.length <= 100, 'o repositório limita a página a 100');
  const first = created[0] ?? '';
  await strategies.softDeleteStrategy(owner.scope, first);
  const afterDelete = await strategies.listStrategiesPage(owner.scope, {
    limit: 100,
    after: undefined,
  });
  assertCondition(
    !afterDelete.strategies.some((strategy) => strategy.id === first),
    'apagada some',
  );
  reportCheck(
    'listStrategiesPage: cursor sem repetir, da mais nova à mais antiga, só do dono, teto de 100',
  );
}

async function checkVersionPagination(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-strategy-page-owner');
  const other = await resolvePersistenceOwner(handle, 'subject-strategy-page-other');
  const strategies = createStrategyRepository(handle);
  const strategy = await strategies.createStrategy(owner.scope, {
    name: 'Versões',
    isExample: false,
  });
  for (let index = 0; index < VERSION_COUNT; index += 1) {
    await strategies.addVersion(owner.scope, {
      strategyId: strategy.id,
      config: { schemaVersion: 1, nonce: `v-${index}` },
      configHash: hashOf(`v-${index}`),
    });
  }
  const first = await strategies.listVersionsPage(owner.scope, {
    strategyId: strategy.id,
    limit: PAGE_SIZE,
    after: undefined,
  });
  assertCondition(first?.versions.map((v) => v.version).join() === '4,3', 'primeira página: 4,3');
  assertCondition(first?.nextCursor === 3, 'o cursor é o número da última versão');
  const second = await strategies.listVersionsPage(owner.scope, {
    strategyId: strategy.id,
    limit: PAGE_SIZE,
    after: first?.nextCursor,
  });
  assertCondition(second?.versions.map((v) => v.version).join() === '2,1', 'segunda página: 2,1');
  assertCondition(second?.nextCursor === undefined, 'sem próxima página');
  const foreign = await strategies.listVersionsPage(other.scope, {
    strategyId: strategy.id,
    limit: PAGE_SIZE,
    after: undefined,
  });
  assertCondition(foreign === undefined, 'estratégia de outro dono: indistinguível de inexistente');
  await strategies.softDeleteStrategy(owner.scope, strategy.id);
  const deleted = await strategies.listVersionsPage(owner.scope, {
    strategyId: strategy.id,
    limit: PAGE_SIZE,
    after: undefined,
  });
  assertCondition(deleted === undefined, 'estratégia apagada não lista versões');
  reportCheck(
    'listVersionsPage: da mais nova à mais antiga por cursor; outro dono e apagada = undefined',
  );
}

export async function checkStrategyPages(context: LifecycleCheckContext): Promise<void> {
  await checkAtomicCreation(context);
  await checkStrategyPagination(context);
  await checkVersionPagination(context);
}
