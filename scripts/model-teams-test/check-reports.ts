// Copyright (c) 2026 Ada Technology. All rights reserved.
import { assertCondition } from '../identity-test/identity-test.error.js';
import {
  insertPending,
  readReports,
  reportCheck,
  waitForStatus,
  waitUntil,
  type Providers,
} from './model-teams-context.js';
import {
  CANDLE_MILLISECONDS,
  EXPECTED_COST,
  PROVIDER_LATENCY_MILLISECONDS,
  SENTINEL,
} from './model-teams-test.constant.js';
import type { WorkerProcess } from './worker-process.js';

export type CheckContext = {
  readonly client: Bun.SQL;
  readonly providers: Providers;
  readonly lastOpen: number;
  readonly worker: WorkerProcess;
};

const PROVIDER_OF = { lucas: 'anthropic', nina: 'google', olivia: 'openai' } as const;
type TeamName = keyof typeof PROVIDER_OF;
const TEAMS: readonly TeamName[] = ['nina', 'lucas', 'olivia'];

async function readHeartbeatTeams(
  client: Bun.SQL,
): Promise<Record<string, { providerState: string }>> {
  const rows: unknown =
    await client`SELECT model_teams FROM worker_heartbeats ORDER BY last_beat_at DESC LIMIT 1`;
  const first = (
    rows as readonly { model_teams: Record<string, { providerState: string }> | null }[]
  )[0];
  return first?.model_teams ?? {};
}

async function waitForState(client: Bun.SQL, team: TeamName, state: string): Promise<void> {
  await waitUntil(
    async () => (await readHeartbeatTeams(client))[team]?.providerState === state,
    `o batimento mostrar ${team} em ${state}`,
  );
}

function assertNoSecret(text: string, where: string): void {
  for (const secret of Object.values(SENTINEL)) {
    assertCondition(!text.includes(secret), `a chave sentinela apareceu em ${where}`);
  }
}

// Sem nenhuma ação: o worker sobe, o enfileirador acha a última vela gravada e cada equipe decide uma vez.
export async function checkScheduledReports(context: CheckContext): Promise<void> {
  const { client, providers, lastOpen, worker } = context;
  for (const team of TEAMS) {
    providers[team].behavior = { kind: 'report', delayMilliseconds: PROVIDER_LATENCY_MILLISECONDS };
  }
  await waitUntil(
    async () =>
      (await readReports(client, "kind = 'scheduled' AND status <> 'pending'")).length === 3,
    'as três equipes decidirem a última vela',
  );
  const rows = await readReports(client, "kind = 'scheduled'");
  assertCondition(rows.length === 3, 'uma linha por equipe, nem mais nem menos');
  for (const row of rows) {
    const team = row.team_key as TeamName;
    assertCondition(row.status === 'decided', `${team} deveria estar decidida, está ${row.status}`);
    assertCondition(Number(row.candle_time) === lastOpen, `${team} decidiu a vela errada`);
    assertCondition(
      Number(row.cost_usd) === Number(EXPECTED_COST[team]),
      `${team}: custo ${row.cost_usd}`,
    );
    assertCondition(Number(row.reserved_usd) === 0, `${team}: a reserva deveria estar zerada`);
    assertCondition(
      (row.latency_ms ?? 0) >= PROVIDER_LATENCY_MILLISECONDS,
      `${team}: latência ${row.latency_ms} abaixo da do falso`,
    );
    assertCondition(/^[0-9a-f]{64}$/u.test(row.prompt_hash ?? ''), `${team}: hash do prompt`);
    assertCondition(
      providers[team].requests.length === 1,
      `${team}: exatamente uma chamada ao provedor`,
    );
  }
  const everything = JSON.stringify(await client`SELECT * FROM model_team_reports`);
  assertNoSecret(everything, 'uma linha de model_team_reports');
  assertNoSecret(worker.output(), 'a saída do worker');
  for (const team of TEAMS) await waitForState(client, team, 'ready');
  assertNoSecret(JSON.stringify(await readHeartbeatTeams(client)), 'o batimento');
  const requestBodies = TEAMS.flatMap((team) =>
    providers[team].requests.map((request) => request.body),
  );
  assertCondition(
    requestBodies.every((body) => !/"userId"|runId|@/u.test(body)),
    'o pedido ao provedor levou dado de usuário',
  );
  reportCheck(
    '3 equipes decidiram a última vela uma vez, com custo, latência, hash e batimento "ready"; sem chave em linha, saída nem batimento',
  );
}

async function requestOn(
  context: CheckContext,
  team: TeamName,
  candleOffset: number,
): Promise<string> {
  const id = await insertPending(context.client, {
    teamKey: team,
    provider: PROVIDER_OF[team],
    candleTime: context.lastOpen - candleOffset * CANDLE_MILLISECONDS,
  });
  return id;
}

async function checkCircuitOpens(context: CheckContext): Promise<void> {
  const { client, providers } = context;
  providers.nina.behavior = { kind: 'status', status: 500 };
  const before = providers.nina.requests.length;
  const ids = await Promise.all([1, 2, 3].map((offset) => requestOn(context, 'nina', offset)));
  const failed = await Promise.all(ids.map((id) => waitForStatus(client, id)));
  assertCondition(
    failed.every((row) => row.failure_code === 'UNAVAILABLE'),
    '5xx em série deveria dar UNAVAILABLE',
  );
  const calls = providers.nina.requests.length - before;
  assertCondition(calls === 3, `3 chamadas antes de abrir, houve ${calls}`);
  const fourth = await waitForStatus(client, await requestOn(context, 'nina', 4));
  assertCondition(
    fourth.status === 'skipped' && fourth.failure_code === 'CIRCUIT_OPEN',
    'a 4ª vela deveria ser pulada pelo circuito',
  );
  assertCondition(
    providers.nina.requests.length - before === 3,
    'circuito aberto não chama o provedor',
  );
  await waitForState(client, 'nina', 'circuit_open');
  reportCheck(
    '5xx em série: 3 falhas abrem o circuito, a 4ª é CIRCUIT_OPEN sem chamada e o batimento mostra circuit_open',
  );
}

async function checkRateLimitAndRejection(context: CheckContext): Promise<void> {
  const { client, providers } = context;
  providers.lucas.behavior = { kind: 'status', status: 429, retryAfterSeconds: 60 };
  const limited = await waitForStatus(client, await requestOn(context, 'lucas', 1));
  assertCondition(limited.failure_code === 'RATE_LIMITED', '429 deveria dar RATE_LIMITED');
  const next = await waitForStatus(client, await requestOn(context, 'lucas', 2));
  assertCondition(
    next.failure_code === 'CIRCUIT_OPEN',
    'depois do 429 o circuito fica aberto até o Retry-After',
  );
  providers.olivia.behavior = { kind: 'status', status: 401 };
  const rejected = await waitForStatus(client, await requestOn(context, 'olivia', 1));
  assertCondition(rejected.failure_code === 'KEY_REJECTED', '401 deveria dar KEY_REJECTED');
  await waitForState(client, 'olivia', 'key_rejected');
  reportCheck(
    '429 respeita o Retry-After (circuito aberto) e 401 vira KEY_REJECTED com batimento key_rejected',
  );
}

async function checkBudgetCut(context: CheckContext): Promise<void> {
  const { client, providers } = context;
  await client`INSERT INTO model_team_reports (id, team_key, provider, model_id, prompt_version, kind, symbol, timeframe, candle_time, status, failure_code, cost_usd)
    VALUES (${Bun.randomUUIDv7()}, 'lucas', 'anthropic', 'm', 'team-prompt-1', 'on_demand', 'ETHUSDT', '15m', 1, 'failed', 'SEED', 1.99999)`;
  const before = TEAMS.reduce((total, team) => total + providers[team].requests.length, 0);
  const cut = await waitForStatus(client, await requestOn(context, 'lucas', 3));
  assertCondition(
    cut.status === 'skipped' && cut.failure_code === 'BUDGET_EXHAUSTED',
    `acima do teto deveria ser BUDGET_EXHAUSTED, foi ${cut.failure_code}`,
  );
  const after = TEAMS.reduce((total, team) => total + providers[team].requests.length, 0);
  assertCondition(after === before, 'acima do teto nenhuma chamada a mais');
  await waitForState(client, 'lucas', 'budget_exhausted');
  await client`DELETE FROM model_team_reports WHERE failure_code = 'SEED'`;
  const rows: unknown =
    await client`SELECT COALESCE(SUM(reserved_usd), 0)::text AS reserved FROM model_team_reports`;
  const reserved = rows as readonly { reserved: string }[];
  assertCondition(Number(reserved[0]?.reserved) === 0, 'nenhuma reserva sobrou');
  reportCheck(
    'teto diário: BUDGET_EXHAUSTED sem chamada, batimento budget_exhausted e nenhuma reserva sobrando',
  );
}

export async function checkCircuitsAndBudget(context: CheckContext): Promise<void> {
  await checkBudgetCut(context);
  await checkCircuitOpens(context);
  await checkRateLimitAndRejection(context);
  assertNoSecret(context.worker.output(), 'a saída do worker depois das falhas');
}
