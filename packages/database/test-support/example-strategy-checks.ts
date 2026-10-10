// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonContainer } from '../src/json-value.types.js';
import { createStrategyRepository } from '../src/strategies/strategy.repository.js';
import { EXAMPLE_SEED_OUTCOME } from '../src/strategies/strategy.constant.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import { captureErrorCode, hashOf, resolvePersistenceOwner } from './persistence-seed.js';

const CONCURRENT_ACCESSES = 20;
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const EXAMPLE_NAME = 'Placar clássico';
const EXAMPLE_CONFIG: JsonContainer = { schemaVersion: 1, name: EXAMPLE_NAME, nonce: 'exemplo' };
const EXAMPLE_PARAMS = {
  name: EXAMPLE_NAME,
  config: EXAMPLE_CONFIG,
  configHash: hashOf('example-config'),
} as const;

type CountRow = { readonly total: number };
type SeededRow = { readonly seeded_at: Date | null };

async function countRows(client: Bun.SQL, table: string, userId: string): Promise<number> {
  const rows: unknown = await client.unsafe(
    `SELECT count(*)::int AS total FROM ${table} WHERE user_id = $1`,
    [userId],
  );
  return (rows as readonly CountRow[])[0]?.total ?? 0;
}

async function countExamples(client: Bun.SQL, userId: string): Promise<number> {
  const rows: unknown =
    await client`SELECT count(*)::int AS total FROM strategies WHERE user_id = ${userId} AND is_example`;
  return (rows as readonly CountRow[])[0]?.total ?? 0;
}

async function readMarker(client: Bun.SQL, userId: string): Promise<Date | null> {
  const rows: unknown =
    await client`SELECT example_strategy_seeded_at AS seeded_at FROM users WHERE id = ${userId}`;
  return (rows as readonly SeededRow[])[0]?.seeded_at ?? null;
}

async function checkConcurrentFirstAccesses(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-example-race');
  const strategies = createStrategyRepository(handle);
  const outcomes = await Promise.all(
    Array.from({ length: CONCURRENT_ACCESSES }, () =>
      strategies.seedExampleStrategy(owner.scope, EXAMPLE_PARAMS),
    ),
  );
  const seeded = outcomes.filter((outcome) => outcome === EXAMPLE_SEED_OUTCOME.SEEDED).length;
  assertCondition(seeded === 1, `exatamente uma semeadura vence a corrida, obtidas ${seeded}`);
  const examples = await countExamples(client, owner.userId);
  const versions = await countRows(client, 'strategy_versions', owner.userId);
  assertCondition(examples === 1, `esperada 1 estratégia de exemplo, obtidas ${examples}`);
  assertCondition(versions === 1, `esperada 1 versão, obtidas ${versions}`);
  assertCondition((await readMarker(client, owner.userId)) !== null, 'a marca de semeadura existe');
  reportCheck(
    `${CONCURRENT_ACCESSES} primeiros acessos simultâneos do mesmo usuário -> 1 estratégia de exemplo e 1 versão`,
  );
}

async function checkSeedingHappensOnce(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-example-once');
  const strategies = createStrategyRepository(handle);
  await strategies.seedExampleStrategy(owner.scope, EXAMPLE_PARAMS);
  const markedAt = await readMarker(client, owner.userId);
  const [example] = await strategies.listStrategies(owner.scope);
  assertCondition(example?.isExample === true, 'a estratégia semeada é is_example');
  await client`UPDATE strategies SET name = 'Renomeada pelo dono' WHERE id = ${example?.id ?? ''}`;
  await strategies.addVersion(owner.scope, {
    strategyId: example?.id ?? '',
    config: { ...EXAMPLE_CONFIG, nonce: 'editada' },
    configHash: hashOf('edited'),
  });
  const afterEdit = await strategies.seedExampleStrategy(owner.scope, EXAMPLE_PARAMS);
  assertCondition(afterEdit === EXAMPLE_SEED_OUTCOME.SKIPPED, 'renomear e editar não re-semeia');
  assertCondition((await countExamples(client, owner.userId)) === 1, 'continua uma só');
  await strategies.softDeleteStrategy(owner.scope, example?.id ?? '');
  const afterDelete = await strategies.seedExampleStrategy(owner.scope, EXAMPLE_PARAMS);
  assertCondition(afterDelete === EXAMPLE_SEED_OUTCOME.SKIPPED, 'apagar não traz de volta');
  assertCondition((await strategies.listStrategies(owner.scope)).length === 0, 'lista vazia');
  await client`DELETE FROM strategy_versions WHERE user_id = ${owner.userId}`;
  await client`DELETE FROM strategies WHERE user_id = ${owner.userId}`;
  const afterPurge = await strategies.seedExampleStrategy(owner.scope, EXAMPLE_PARAMS);
  assertCondition(afterPurge === EXAMPLE_SEED_OUTCOME.SKIPPED, 'sem linha alguma, a marca segura');
  assertCondition((await countExamples(client, owner.userId)) === 0, 'nada foi recriado');
  const markedAfter = await readMarker(client, owner.userId);
  assertCondition(markedAfter?.getTime() === markedAt?.getTime(), 'a marca não é regravada');
  reportCheck('renomear, editar (nova versão), apagar e até remover a linha: o exemplo não volta');
}

async function checkCopiesAreIndependent(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const first = await resolvePersistenceOwner(handle, 'subject-example-copy-a');
  const second = await resolvePersistenceOwner(handle, 'subject-example-copy-b');
  const strategies = createStrategyRepository(handle);
  await strategies.seedExampleStrategy(first.scope, EXAMPLE_PARAMS);
  await strategies.seedExampleStrategy(second.scope, EXAMPLE_PARAMS);
  const [exampleA] = await strategies.listStrategies(first.scope);
  const [exampleB] = await strategies.listStrategies(second.scope);
  assertCondition(exampleA !== undefined && exampleB !== undefined, 'cada um recebeu a sua');
  assertCondition(exampleA?.id !== exampleB?.id, 'linhas diferentes');
  const versionsA = await strategies.listVersions(first.scope, exampleA?.id ?? '');
  const versionsB = await strategies.listVersions(second.scope, exampleB?.id ?? '');
  assertCondition(versionsA?.[0]?.id !== versionsB?.[0]?.id, 'versões diferentes');
  assertCondition(
    (await strategies.findStrategy(second.scope, exampleA?.id ?? '')) === undefined,
    'B não enxerga a cópia de A',
  );
  await strategies.addVersion(first.scope, {
    strategyId: exampleA?.id ?? '',
    config: { ...EXAMPLE_CONFIG, nonce: 'so-do-a' },
    configHash: hashOf('only-a'),
  });
  const untouched = await strategies.listVersions(second.scope, exampleB?.id ?? '');
  assertCondition(untouched?.length === 1, 'editar a de A não altera a de B');
  assertCondition(untouched?.[0]?.configHash === EXAMPLE_PARAMS.configHash, 'hash de B intacto');
  await strategies.softDeleteStrategy(first.scope, exampleA?.id ?? '');
  assertCondition((await strategies.listStrategies(second.scope)).length === 1, 'B ainda a tem');
  assertCondition((await countExamples(client, second.userId)) === 1, 'uma linha de B');
  reportCheck('dois usuários: cópias independentes (linhas e versões próprias, edição isolada)');
}

async function checkFailureLeavesNoTrace(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-example-failure');
  const strategies = createStrategyRepository(handle);
  const code = await captureErrorCode(
    strategies.seedExampleStrategy(owner.scope, { ...EXAMPLE_PARAMS, configHash: 'não-é-hash' }),
  );
  assertCondition(code === CHECK_VIOLATION, `hash inválido recusado pelo banco: ${String(code)}`);
  assertCondition((await readMarker(client, owner.userId)) === null, 'a marca foi desfeita');
  assertCondition((await countExamples(client, owner.userId)) === 0, 'nenhuma estratégia sobrou');
  const retried = await strategies.seedExampleStrategy(owner.scope, EXAMPLE_PARAMS);
  assertCondition(retried === EXAMPLE_SEED_OUTCOME.SEEDED, 'o próximo acesso semeia');
  reportCheck('falha no meio da semeadura desfaz tudo, inclusive a marca: tenta de novo depois');
}

async function checkInactiveAccountsAreSkipped(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const blocked = await resolvePersistenceOwner(handle, 'subject-example-blocked');
  const deleted = await resolvePersistenceOwner(handle, 'subject-example-deleted');
  await client`UPDATE users SET blocked_at = now() WHERE id = ${blocked.userId}`;
  await client`UPDATE users SET deleted_at = now() WHERE id = ${deleted.userId}`;
  const strategies = createStrategyRepository(handle);
  for (const owner of [blocked, deleted]) {
    const outcome = await strategies.seedExampleStrategy(owner.scope, EXAMPLE_PARAMS);
    assertCondition(outcome === EXAMPLE_SEED_OUTCOME.SKIPPED, 'conta inativa não é semeada');
    assertCondition((await countExamples(client, owner.userId)) === 0, 'nenhuma linha criada');
    assertCondition((await readMarker(client, owner.userId)) === null, 'sem marca');
  }
  reportCheck('conta bloqueada ou apagada não recebe a estratégia de exemplo');
}

async function checkOneExamplePerUserIndex(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-example-index');
  const strategies = createStrategyRepository(handle);
  await strategies.createStrategy(owner.scope, { name: 'Primeira', isExample: true });
  const code = await captureErrorCode(
    strategies.createStrategy(owner.scope, { name: 'Segunda', isExample: true }),
  );
  assertCondition(code === UNIQUE_VIOLATION, `índice único parcial recusa a segunda: ${code}`);
  await strategies.createStrategy(owner.scope, { name: 'Comum 1', isExample: false });
  await strategies.createStrategy(owner.scope, { name: 'Comum 2', isExample: false });
  reportCheck('índice único parcial: uma estratégia is_example por usuário, comuns à vontade');
}

export async function checkExampleStrategySeeding(context: LifecycleCheckContext): Promise<void> {
  await checkFailureLeavesNoTrace(context);
  await checkConcurrentFirstAccesses(context);
  await checkSeedingHappensOnce(context);
  await checkCopiesAreIndependent(context);
  await checkInactiveAccountsAreSkipped(context);
  await checkOneExamplePerUserIndex(context);
}
