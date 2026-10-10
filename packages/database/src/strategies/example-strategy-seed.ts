// Copyright (c) 2026 Ada Technology. All rights reserved.
import { and, isNull, sql } from 'drizzle-orm';
import type { BunSQLDatabase } from 'drizzle-orm/bun-sql';

import type { DatabaseExecutor } from '../database-executor.js';
import { toJsonb } from '../jsonb.js';
import { ownerCondition, type OwnerScope } from '../ownership/owner-scope.js';
import { strategies, strategyVersions } from '../schema/strategies.schema.js';
import { users } from '../schema/users.schema.js';
import { EXAMPLE_SEED_OUTCOME, type ExampleSeedOutcome } from './strategy.constant.js';
import type { SeedExampleStrategyParams } from './strategy.types.js';

type SeedTransaction = Pick<DatabaseExecutor, 'insert'>;

async function insertExample(
  transaction: SeedTransaction,
  scope: OwnerScope,
  params: SeedExampleStrategyParams,
): Promise<boolean> {
  const created = await transaction
    .insert(strategies)
    .values({
      id: Bun.randomUUIDv7(),
      userId: scope.ownerUserId,
      name: params.name,
      isExample: true,
    })
    .onConflictDoNothing()
    .returning({ id: strategies.id });
  const strategyId = created[0]?.id;
  if (strategyId === undefined) return false;
  await transaction.insert(strategyVersions).values({
    id: Bun.randomUUIDv7(),
    userId: scope.ownerUserId,
    strategyId,
    version: 1,
    config: toJsonb(params.config),
    configHash: params.configHash,
  });
  return true;
}

// A MARCA em `users.example_strategy_seeded_at` é a prova de que o usuário já recebeu o exemplo: o `UPDATE` condicional
// serializa os acessos simultâneos (os outros esperam o lock da linha e, ao reler, não casam mais) e, na mesma
// transação, nascem a estratégia e a versão 1. Falha em qualquer ponto desfaz TUDO, inclusive a marca. Conta apagada ou
// bloqueada não casa a condição. Apagar, renomear ou editar o exemplo não zera a marca; o índice único parcial é só a
// segunda trava.
export async function seedExampleStrategy(
  database: Pick<BunSQLDatabase, 'transaction'>,
  scope: OwnerScope,
  params: SeedExampleStrategyParams,
): Promise<ExampleSeedOutcome> {
  return database.transaction(async (transaction) => {
    const marked = await transaction
      .update(users)
      .set({ exampleStrategySeededAt: sql`now()` })
      .where(
        and(
          ownerCondition(scope, users.id),
          isNull(users.exampleStrategySeededAt),
          isNull(users.deletedAt),
          isNull(users.blockedAt),
        ),
      )
      .returning({ id: users.id });
    if (marked.length === 0) return EXAMPLE_SEED_OUTCOME.SKIPPED;
    const isInserted = await insertExample(transaction, scope, params);
    return isInserted ? EXAMPLE_SEED_OUTCOME.SEEDED : EXAMPLE_SEED_OUTCOME.SKIPPED;
  });
}
