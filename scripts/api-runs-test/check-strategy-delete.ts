// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  CLASSIC_SCOREBOARD_STRATEGY,
  createStrategyVersion,
} from '../../packages/strategy-engine/src/index.js';
import { SUBJECT_A, SUBJECT_B, SUBJECT_EXAMPLE } from './api-runs-test.constant.js';
import { assertCondition, reportLine, type ApiRunsContext } from './api-runs-test-context.js';
import { dataOf } from './api-runs-helpers.js';

const STRATEGIES_PATH = '/v1/strategies';

type Created = {
  readonly strategy: { readonly id: string };
  readonly version: { readonly configHash: string };
};

async function createStrategy(
  context: ApiRunsContext,
  subject: string,
  name: string,
): Promise<Created> {
  return dataOf<Created>(
    await context.call({
      subject,
      method: 'POST',
      path: STRATEGIES_PATH,
      body: { name, config: CLASSIC_SCOREBOARD_STRATEGY.version.config },
    }),
    201,
  );
}

async function listIds(context: ApiRunsContext, subject: string): Promise<readonly string[]> {
  const listed = dataOf<readonly { readonly id: string }[]>(
    await context.call({ subject, path: `${STRATEGIES_PATH}?limit=100` }),
    200,
  );
  return listed.map((strategy) => strategy.id);
}

// Apagar é lógico (as execuções e os resultados ficam); só o dono apaga; o exemplo não se apaga; a versão traz o hash.
export async function checkStrategyDelete(context: ApiRunsContext): Promise<void> {
  const created = await createStrategy(context, SUBJECT_A, 'Para apagar');
  assertCondition(
    created.version.configHash ===
      createStrategyVersion(CLASSIC_SCOREBOARD_STRATEGY.version.config).configHash,
    'a versão devolve o hash SHA-256 da configuração',
  );
  const foreign = await context.call({
    subject: SUBJECT_B,
    method: 'DELETE',
    path: `${STRATEGIES_PATH}/${created.strategy.id}`,
  });
  assertCondition(foreign.status === 404, `B apagando a estratégia de A: ${foreign.status}`);
  assertCondition(
    (await listIds(context, SUBJECT_A)).includes(created.strategy.id),
    'a de A continua lá',
  );

  const deleted = await context.call({
    subject: SUBJECT_A,
    method: 'DELETE',
    path: `${STRATEGIES_PATH}/${created.strategy.id}`,
  });
  assertCondition(deleted.status === 204, `apagar a própria estratégia: ${deleted.status}`);
  assertCondition(
    !(await listIds(context, SUBJECT_A)).includes(created.strategy.id),
    'some da lista',
  );
  const detail = await context.call({
    subject: SUBJECT_A,
    path: `${STRATEGIES_PATH}/${created.strategy.id}`,
  });
  assertCondition(detail.status === 404, `detalhe depois de apagar: ${detail.status}`);
  const rows: unknown =
    await context.client`SELECT (s.deleted_at IS NOT NULL) AS deleted, (SELECT count(*)::int FROM strategy_versions v WHERE v.strategy_id = s.id) AS versions FROM strategies s WHERE s.id = ${created.strategy.id}`;
  const row = (rows as readonly { deleted: boolean; versions: number }[])[0];
  assertCondition(
    row?.deleted === true && row.versions === 1,
    'exclusão lógica: a linha e a versão ficam',
  );

  const example = dataOf<readonly { readonly id: string; readonly isExample: boolean }[]>(
    await context.call({ subject: SUBJECT_EXAMPLE, path: `${STRATEGIES_PATH}?limit=100` }),
    200,
  ).find((strategy) => strategy.isExample);
  const refused = await context.call({
    subject: SUBJECT_EXAMPLE,
    method: 'DELETE',
    path: `${STRATEGIES_PATH}/${example?.id}`,
  });
  assertCondition(refused.status === 409, `apagar o exemplo: ${refused.status}`);
  reportLine(
    'apagar estratégia: 204 só para o dono, 404 idêntico para outro usuário, exemplo recusado (409), exclusão lógica e hash na versão',
  );
}
