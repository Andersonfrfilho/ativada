// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createCandleRepository,
  createUserModelTeamRepository,
  type DatabaseHandle,
  type OwnerScope,
} from '../../packages/database/src/index.js';
import { createRunRepository } from '../../packages/database/src/runs/run.repository.js';
import { RUN_KIND, RUN_STATUS } from '../../packages/database/src/runs/run.constant.js';
import {
  resolvePersistenceOwner,
  seedRun,
} from '../../packages/database/test-support/persistence-seed.js';
import {
  startFakeProvider,
  type FakeProviderServer,
} from '../../packages/model-agents/test-support/fake-provider-server.js';
import { FAKE_PROVIDER } from '../../packages/model-agents/test-support/fake-provider-payloads.js';
import { assertCondition } from '../identity-test/identity-test.error.js';
import {
  CANDLE_MILLISECONDS,
  EXCHANGE,
  MODEL_ID,
  SEEDED_CANDLES,
  SEED_PRICE,
  SENTINEL,
  SYMBOL,
  TIMEFRAME,
  WAIT_TIMEOUT_MILLISECONDS,
} from './model-teams-test.constant.js';

export type Providers = {
  readonly lucas: FakeProviderServer;
  readonly nina: FakeProviderServer;
  readonly olivia: FakeProviderServer;
};

export type ReportRow = {
  readonly id: string;
  readonly team_key: string;
  readonly kind: string;
  readonly candle_time: string;
  readonly status: string;
  readonly failure_code: string | null;
  readonly cost_usd: string;
  readonly reserved_usd: string;
  readonly latency_ms: number | null;
  readonly prompt_hash: string | null;
};

export function startProviders(): Providers {
  const make = (
    kind: (typeof FAKE_PROVIDER)[keyof typeof FAKE_PROVIDER],
    key: string,
  ): FakeProviderServer => startFakeProvider({ kind, expectedKey: key, expectedModel: MODEL_ID });
  return {
    lucas: make(FAKE_PROVIDER.ANTHROPIC, SENTINEL.anthropic),
    nina: make(FAKE_PROVIDER.GEMINI, SENTINEL.gemini),
    olivia: make(FAKE_PROVIDER.OPENAI, SENTINEL.openai),
  };
}

export function lastClosedOpenTime(): number {
  return Math.floor(Date.now() / CANDLE_MILLISECONDS) * CANDLE_MILLISECONDS - CANDLE_MILLISECONDS;
}

export async function seedCandles(handle: DatabaseHandle, lastOpen: number): Promise<void> {
  const candles = Array.from({ length: SEEDED_CANDLES }, (_unused, index) => {
    const openTime = lastOpen - (SEEDED_CANDLES - 1 - index) * CANDLE_MILLISECONDS;
    return {
      exchange: EXCHANGE,
      symbol: SYMBOL,
      timeframe: TIMEFRAME,
      openTime,
      closeTime: openTime + CANDLE_MILLISECONDS - 1,
      open: SEED_PRICE,
      high: '101.00000000',
      low: '99.00000000',
      close: SEED_PRICE,
      volume: '10.00000000',
      tradeCount: 1,
    } as const;
  });
  await createCandleRepository(handle).upsertCandles(candles);
}

// Uma simulação ao vivo RODANDO no par e um dono com as três equipes ligadas. A execução é marcada como de outro worker, com
// batimento no futuro, para o avaliador do worker de teste não a reivindicar (o teste é do despachante, não do motor).
export async function seedOwner(
  handle: DatabaseHandle,
  client: Bun.SQL,
): Promise<{ readonly scope: OwnerScope; readonly runId: string }> {
  const owner = await resolvePersistenceOwner(handle, 'subject-model-teams-test');
  const run = await seedRun(handle, owner, {
    kind: RUN_KIND.LIVE_PAPER,
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    periodEnd: undefined,
  });
  await createRunRepository(handle).transitionRun(owner.scope, {
    runId: run.id,
    to: RUN_STATUS.RUNNING,
  });
  await client`UPDATE runs SET claimed_by = 'other-worker', heartbeat_at = now() + interval '2 hours' WHERE id = ${run.id}`;
  const teams = createUserModelTeamRepository(handle);
  for (const teamKey of ['nina', 'lucas', 'olivia']) {
    await teams.setEnabled(owner.scope, { teamKey, isEnabled: true });
  }
  return { scope: owner.scope, runId: run.id };
}

export async function readReports(client: Bun.SQL, where = 'true'): Promise<readonly ReportRow[]> {
  const rows: unknown = await client.unsafe(
    `SELECT id, team_key, kind, candle_time::text, status, failure_code, cost_usd::text, reserved_usd::text, latency_ms, prompt_hash
     FROM model_team_reports WHERE ${where} ORDER BY requested_at, id`,
  );
  return rows as readonly ReportRow[];
}

// Pedido avulso diretamente na fila: o despachante o trata como qualquer relatório (sem a regra de idade).
export async function insertPending(
  client: Bun.SQL,
  params: { readonly teamKey: string; readonly provider: string; readonly candleTime: number },
): Promise<string> {
  const id = Bun.randomUUIDv7();
  await client`INSERT INTO model_team_reports (id, team_key, provider, model_id, prompt_version, kind, symbol, timeframe, candle_time, status)
    VALUES (${id}, ${params.teamKey}, ${params.provider}, ${MODEL_ID}, 'team-prompt-1', 'on_demand', ${SYMBOL}, ${TIMEFRAME}, ${params.candleTime}, 'pending')`;
  return id;
}

export async function waitUntil(
  condition: () => boolean | Promise<boolean>,
  description: string,
): Promise<void> {
  const deadline = Date.now() + WAIT_TIMEOUT_MILLISECONDS;
  while (!(await condition())) {
    assertCondition(Date.now() < deadline, `tempo esgotado esperando: ${description}`);
    await Bun.sleep(100);
  }
}

export async function waitForStatus(client: Bun.SQL, id: string): Promise<ReportRow> {
  let found: ReportRow | undefined;
  await waitUntil(
    async () => {
      found = (await readReports(client, `id = '${id}'`))[0];
      return found !== undefined && found.status !== 'pending';
    },
    `relatório ${id.slice(0, 8)} sair de pending`,
  );
  if (found === undefined) throw new Error('relatório sumiu');
  return found;
}

export function reportCheck(message: string): void {
  console.log(`model-teams-test: ${message}`);
}
