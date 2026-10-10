// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonContainer } from '../src/json-value.types.js';
import { createStrategyRepository } from '../src/strategies/strategy.repository.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import { captureErrorCode, hashOf, resolvePersistenceOwner, seedRun } from './persistence-seed.js';

const CHECK_VIOLATION = '23514';
const RESTRICT_VIOLATIONS: readonly string[] = ['23001', '23503'];
const CONCURRENT_VERSIONS = 10;

type TypeRow = { readonly kind: string };

function configOf(name: string, nonce: string): JsonContainer {
  return { schemaVersion: 1, name, nonce };
}

async function checkVersionByHash(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-strategy-owner');
  const strategies = createStrategyRepository(handle);
  const strategy = await strategies.createStrategy(owner.scope, {
    name: 'Placar',
    isExample: true,
  });
  const first = configOf('Placar', 'a');
  const created = await strategies.addVersion(owner.scope, {
    strategyId: strategy.id,
    config: first,
    configHash: hashOf('a'),
  });
  const repeated = await strategies.addVersion(owner.scope, {
    strategyId: strategy.id,
    config: first,
    configHash: hashOf('a'),
  });
  assertCondition(created?.isNew === true && created.version.version === 1, 'primeira versão é 1');
  assertCondition(
    repeated?.isNew === false && repeated.version.id === created?.version.id,
    'mesmo hash devolve a MESMA versão',
  );
  const changed = await strategies.addVersion(owner.scope, {
    strategyId: strategy.id,
    config: configOf('Placar', 'b'),
    configHash: hashOf('b'),
  });
  assertCondition(changed?.isNew === true && changed.version.version === 2, 'hash novo, versão 2');
  const rows: unknown =
    await client`SELECT jsonb_typeof(config) AS kind FROM strategy_versions WHERE strategy_id = ${strategy.id}`;
  assertCondition(
    (rows as readonly TypeRow[]).every((row) => row.kind === 'object'),
    'config deve ser jsonb do tipo object, não string',
  );
  const listed = await strategies.listVersions(owner.scope, strategy.id);
  assertCondition(
    listed?.map((version) => version.version).join() === '1,2',
    'versões em ordem crescente',
  );
  reportCheck(
    'estratégia: mesma configuração (hash) devolve a mesma versão; hash novo gera a próxima',
  );
}

async function checkConcurrentVersions(context: LifecycleCheckContext): Promise<void> {
  const { handle, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-strategy-owner');
  const strategies = createStrategyRepository(handle);
  const strategy = await strategies.createStrategy(owner.scope, {
    name: 'Corrida',
    isExample: false,
  });
  const distinct = await Promise.all(
    Array.from({ length: CONCURRENT_VERSIONS }, (_unused, index) =>
      strategies.addVersion(owner.scope, {
        strategyId: strategy.id,
        config: configOf('Corrida', String(index)),
        configHash: hashOf(`distinct-${index}`),
      }),
    ),
  );
  const numbers = distinct.map((result) => result?.version.version ?? 0).sort((a, b) => a - b);
  assertCondition(
    numbers.join() === Array.from({ length: CONCURRENT_VERSIONS }, (_u, i) => i + 1).join(),
    `versões concorrentes devem ser 1..N sem repetir: ${numbers.join()}`,
  );
  const sameHash = await Promise.all(
    Array.from({ length: CONCURRENT_VERSIONS }, () =>
      strategies.addVersion(owner.scope, {
        strategyId: strategy.id,
        config: configOf('Corrida', 'igual'),
        configHash: hashOf('same'),
      }),
    ),
  );
  const ids = new Set(sameHash.map((result) => result?.version.id));
  assertCondition(ids.size === 1, `mesma configuração concorrente gerou ${ids.size} versões`);
  assertCondition(
    sameHash.filter((result) => result?.isNew === true).length === 1,
    'exatamente uma chamada cria a versão',
  );
  reportCheck(
    `${CONCURRENT_VERSIONS} versões concorrentes: numeração 1..N e hash igual vira uma só`,
  );
}

async function checkSoftDeleteAndRestrict(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-strategy-owner');
  const strategies = createStrategyRepository(handle);
  const run = await seedRun(handle, owner);
  const version = await strategies.findVersion(owner.scope, run.strategyVersionId);
  const strategyId = version?.strategyId ?? '';
  const hardDelete = await captureErrorCode(
    client`DELETE FROM strategies WHERE id = ${strategyId}`,
  );
  assertCondition(
    typeof hardDelete === 'string' && RESTRICT_VIOLATIONS.includes(hardDelete),
    `ON DELETE RESTRICT deveria impedir apagar a estratégia com execuções: ${String(hardDelete)}`,
  );
  const versionDelete = await captureErrorCode(
    client`DELETE FROM strategy_versions WHERE id = ${run.strategyVersionId}`,
  );
  assertCondition(
    typeof versionDelete === 'string' && RESTRICT_VIOLATIONS.includes(versionDelete),
    `ON DELETE RESTRICT deveria impedir apagar a versão com execuções: ${String(versionDelete)}`,
  );
  assertCondition(await strategies.softDeleteStrategy(owner.scope, strategyId), 'soft delete');
  assertCondition(
    !(await strategies.softDeleteStrategy(owner.scope, strategyId)),
    'segundo delete',
  );
  assertCondition((await strategies.findStrategy(owner.scope, strategyId)) === undefined, 'oculta');
  const listed = await strategies.listStrategies(owner.scope);
  assertCondition(!listed.some((strategy) => strategy.id === strategyId), 'fora da listagem');
  const added = await strategies.addVersion(owner.scope, {
    strategyId,
    config: configOf('x', 'y'),
    configHash: hashOf('after-delete'),
  });
  assertCondition(added === undefined, 'estratégia apagada não aceita versão nova');
  assertCondition(
    (await strategies.findVersion(owner.scope, run.strategyVersionId)) !== undefined,
    'a versão que gerou uma execução continua legível',
  );
  reportCheck(
    'estratégia: RESTRICT impede apagar com execuções; soft delete oculta e preserva o histórico',
  );
}

async function checkHashConstraint(context: LifecycleCheckContext): Promise<void> {
  const { handle, client, assertCondition, reportCheck } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-strategy-owner');
  const strategy = await createStrategyRepository(handle).createStrategy(owner.scope, {
    name: 'Hash',
    isExample: false,
  });
  const code =
    await captureErrorCode(client`INSERT INTO strategy_versions (id, user_id, strategy_id, version, config, config_hash)
    VALUES (${Bun.randomUUIDv7()}, ${owner.userId}, ${strategy.id}, 1, '{}'::jsonb, 'curto')`);
  assertCondition(code === CHECK_VIOLATION, `config_hash fora do formato -> ${String(code)}`);
  reportCheck('strategy_versions.config_hash fora de SHA-256 hexadecimal -> rejeitado pelo CHECK');
}

export async function checkStrategyRepository(context: LifecycleCheckContext): Promise<void> {
  await checkVersionByHash(context);
  await checkConcurrentVersions(context);
  await checkSoftDeleteAndRestrict(context);
  await checkHashConstraint(context);
}
