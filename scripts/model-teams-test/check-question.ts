// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createTeamQuestionRepository,
  type DatabaseHandle,
  type OwnerScope,
} from '../../packages/database/src/index.js';
import { assertCondition } from '../identity-test/identity-test.error.js';
import { reportCheck, waitUntil, type Providers } from './model-teams-context.js';
import { EXPECTED_COST, SENTINEL, SYMBOL } from './model-teams-test.constant.js';
import type { WorkerProcess } from './worker-process.js';

const QUESTION = 'Como você vê o BTC nas próximas horas?';
const ANSWER =
  'O par fechou as últimas velas perto da média, com volume estável. Não é recomendação.';

type QuestionRow = {
  readonly status: string;
  readonly answer: string | null;
  readonly cost_usd: string;
  readonly reserved_usd: string;
  readonly model_id: string | null;
};

export type QuestionCheckContext = {
  readonly handle: DatabaseHandle;
  readonly client: Bun.SQL;
  readonly providers: Providers;
  readonly worker: WorkerProcess;
  readonly owner: { readonly scope: OwnerScope; readonly runId: string };
};

async function readQuestion(client: Bun.SQL, id: string): Promise<QuestionRow | undefined> {
  const rows: unknown = await client`
    SELECT status, answer, cost_usd::text AS cost_usd, reserved_usd::text AS reserved_usd, model_id
    FROM model_team_questions WHERE id = ${id}`;
  return (rows as readonly QuestionRow[])[0];
}

// A pergunta livre (adendo da spec 015) de ponta a ponta: gravada pelo repositório da rota, reivindicada pelo worker real,
// enviada à Olívia falsa em modo texto e gravada como resposta, com custo e sem reserva sobrando.
export async function checkQuestion(context: QuestionCheckContext): Promise<void> {
  const { client, providers, worker, owner } = context;
  providers.olivia.behavior = { kind: 'text', text: ANSWER };
  const before = providers.olivia.requests.length;
  const id = await createTeamQuestionRepository(context.handle).createQuestion(owner.scope, {
    runId: owner.runId,
    teamKey: 'olivia',
    provider: 'openai',
    symbol: SYMBOL,
    question: QUESTION,
    dailyLimit: 5,
  });
  assertCondition(id !== undefined, 'a pergunta não foi gravada');
  let row: QuestionRow | undefined;
  await waitUntil(async () => {
    row = await readQuestion(client, id);
    return row !== undefined && row.status !== 'pending';
  }, 'a pergunta à Olívia sair de pending');
  assertCondition(
    row?.status === 'answered',
    `a pergunta deveria estar respondida: ${row?.status}`,
  );
  assertCondition(row.answer === ANSWER, 'a resposta gravada não é a do provedor');
  assertCondition(Number(row.cost_usd) === Number(EXPECTED_COST.olivia), `custo ${row.cost_usd}`);
  assertCondition(Number(row.reserved_usd) === 0, 'a reserva da pergunta deveria estar zerada');
  const sent = providers.olivia.requests.slice(before).map((request) => request.body);
  assertCondition(sent.length === 1, `uma chamada à Olívia, houve ${sent.length}`);
  assertCondition(sent[0]?.includes(QUESTION) === true, 'a pergunta não foi ao provedor');
  assertCondition(
    !/json_schema|userId|runId|@/u.test(sent[0] ?? ''),
    'o pedido levou formato ou dado de usuário',
  );
  assertCondition(!worker.output().includes(QUESTION), 'a pergunta apareceu na saída do worker');
  assertCondition(!worker.output().includes(ANSWER), 'a resposta apareceu na saída do worker');
  for (const secret of Object.values(SENTINEL)) {
    assertCondition(!worker.output().includes(secret), 'a chave apareceu na saída do worker');
  }
  reportCheck(
    'pergunta livre: gravada pela rota, respondida pela Olívia em texto, com custo, sem reserva, sem formato nem dado de usuário no pedido e sem texto no log',
  );
}
