// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createRunRepository,
  createStrategyRepository,
  createUserModelTeamRepository,
  type DatabaseHandle,
  type OwnerScope,
} from '../../packages/database/src/index.js';
import { MODEL_TEAM_STRATEGY } from '../../packages/model-agents/src/index.js';
import { parseJsonContainer } from '../../packages/run-recording/src/index.js';
import {
  createRunSetup,
  ENGINE_VERSION,
  METRICS_VERSION,
  SIGNAL_ENGINE_VERSION,
} from '../../packages/strategy-engine/src/index.js';
import { resolvePersistenceOwner } from '../../packages/database/test-support/persistence-seed.js';
import { assertCondition } from '../identity-test/identity-test.error.js';
import { reportCheck, waitUntil } from './model-teams-context.js';
import { CANDLE_MILLISECONDS, SYMBOL, TIMEFRAME } from './model-teams-test.constant.js';

// Quantas velas antes da última a execução de equipe começa (o aquecimento fica atrás dela) e onde mora o relatório gravado.
const RUN_STARTS_CANDLES_BEFORE_LAST = 20;
const REPORT_CANDLES_BEFORE_LAST = 10;
const REPORT_DECIDED_AFTER_CLOSE_MILLISECONDS = 5_000;
const ROLES = JSON.stringify({
  trend: { stance: 'up', reason: 'Leitura de teste.' },
  risk: { level: 'medium', reason: 'Leitura de teste.' },
  decision: { reason: 'Gestor de teste.' },
});

type RunRow = { readonly status: string; readonly last_candle_time: string | null };
type CurveRow = { readonly line: string };

async function createTeamRun(
  handle: DatabaseHandle,
  scope: OwnerScope,
  params: { readonly versionId: string; readonly periodStart: number },
): Promise<string> {
  const setup = createRunSetup({
    schemaVersion: 1,
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    sentimentSource: 'alternative.me',
    initialBalance: '10000',
    feeRate: '0.001',
    slippageRate: '0.0005',
    tickSize: '0.01',
    quantityStep: '0.00001',
    minNotional: '5',
    maxVolumeShare: '0.01',
  });
  const run = await createRunRepository(handle).createRun(scope, {
    strategyVersionId: params.versionId,
    kind: 'live_paper',
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    runParameters: parseJsonContainer(JSON.stringify(setup.parameters)),
    runHash: setup.runHash,
    engineVersion: ENGINE_VERSION,
    signalEngineVersion: SIGNAL_ENGINE_VERSION,
    metricsVersion: METRICS_VERSION,
    periodStart: params.periodStart,
    periodEnd: undefined,
    migratedFromRunId: undefined,
    request: { signalSource: { kind: 'model_team', team: 'lucas' } },
  });
  if (run === undefined) throw new Error('a execução de equipe não foi criada');
  return run.id;
}

async function seedStrategy(handle: DatabaseHandle, scope: OwnerScope): Promise<string> {
  const strategies = createStrategyRepository(handle);
  const strategy = await strategies.createStrategy(scope, {
    name: 'model-team-1',
    isExample: false,
  });
  const added = await strategies.addVersion(scope, {
    strategyId: strategy.id,
    config: parseJsonContainer(JSON.stringify(MODEL_TEAM_STRATEGY.config)),
    configHash: MODEL_TEAM_STRATEGY.configHash,
  });
  if (added === undefined) throw new Error('a versão model-team-1 não foi criada');
  return added.version.id;
}

async function seedDecidedReport(client: Bun.SQL, candleTime: number): Promise<string> {
  const id = Bun.randomUUIDv7();
  const decidedAt = candleTime + CANDLE_MILLISECONDS + REPORT_DECIDED_AFTER_CLOSE_MILLISECONDS;
  // O JSON entra como literal do SQL: um parâmetro de texto com `::jsonb` seria gravado como texto JSON dentro do jsonb.
  await client.unsafe(`INSERT INTO model_team_reports (id, team_key, provider, model_id, prompt_version, kind, symbol, timeframe, candle_time, status, action, entry_price, target_price, stop_price, confidence, roles, decided_at)
    VALUES ('${id}', 'lucas', 'anthropic', 'fake-model-1', 'team-prompt-1', 'scheduled', '${SYMBOL}', '${TIMEFRAME}', ${candleTime}, 'decided', 'buy', 100.5, 102, 99.5, 62, '${ROLES}'::jsonb, to_timestamp(${decidedAt} / 1000.0))`);
  return id;
}

async function readRun(client: Bun.SQL, runId: string): Promise<RunRow | undefined> {
  const rows: unknown =
    await client`SELECT status, last_candle_time::text FROM runs WHERE id = ${runId}`;
  return (rows as readonly RunRow[])[0];
}

async function waitForCandle(client: Bun.SQL, runId: string, candleTime: number): Promise<void> {
  await waitUntil(
    async () => Number((await readRun(client, runId))?.last_candle_time ?? 0) >= candleTime,
    `a execução de equipe processar a vela ${candleTime}`,
  );
}

// As linhas que o replay precisa devolver iguais, vela a vela, até a última que a execução original processou.
async function readCurve(
  client: Bun.SQL,
  runId: string,
  until: number,
): Promise<readonly string[]> {
  const rows: unknown = await client`
    SELECT line FROM (
      SELECT candle_time, 1 AS part, concat_ws('|', 'signal', action, score::text, reason) AS line FROM signals WHERE run_id = ${runId} AND candle_time <= ${until}
      UNION ALL SELECT candle_time, 2, concat_ws('|', 'fill', side, price::text, quantity::text, fee::text) FROM fills WHERE run_id = ${runId} AND candle_time <= ${until}
      UNION ALL SELECT candle_time, 3, concat_ws('|', 'equity', equity::text, equity_at_low::text, benchmark::text) FROM equity_points WHERE run_id = ${runId} AND candle_time <= ${until}
    ) curve ORDER BY candle_time, part, line`;
  return (rows as readonly CurveRow[]).map((row) => row.line);
}

type OwnerRun = { readonly runId: string; readonly versionId: string; readonly scope: OwnerScope };

async function checkBuyAtNextOpen(
  client: Bun.SQL,
  run: OwnerRun,
  reportTime: number,
): Promise<void> {
  await waitForCandle(client, run.runId, reportTime + 2 * CANDLE_MILLISECONDS);
  const inputs: unknown = await client`
    SELECT candle_time::text, report_id::text, failure_code, applied_action FROM team_run_inputs
    WHERE run_id = ${run.runId} ORDER BY candle_time`;
  const rows = inputs as readonly {
    candle_time: string;
    report_id: string | null;
    failure_code: string | null;
    applied_action: string;
  }[];
  const decided = rows.find((row) => Number(row.candle_time) === reportTime);
  assertCondition(
    decided?.report_id !== null &&
      decided?.failure_code === null &&
      decided.applied_action === 'buy',
    `a vela com relatório decidido grava a entrada com a compra aplicada (achou ${JSON.stringify(decided)} em ${rows.length} linhas)`,
  );
  assertCondition(
    rows.some((row) => row.failure_code === 'MISSING'),
    'a vela sem relatório grava "sem leitura" (MISSING)',
  );
  const fills: unknown = await client`
    SELECT candle_time::text, side FROM fills WHERE run_id = ${run.runId} ORDER BY candle_time`;
  const first = (fills as readonly { candle_time: string; side: string }[])[0];
  assertCondition(
    first?.side === 'buy' && Number(first.candle_time) === reportTime + CANDLE_MILLISECONDS,
    'a compra decidida em t executa na abertura de t + 1',
  );
  reportCheck(
    'execução de equipe: o relatório gravado vira compra em t + 1 e a vela sem relatório espera',
  );
}

// REPLAY: a execução original é parada, as entradas gravadas dela são copiadas para uma execução nova e o worker a refaz lendo
// delas (nunca do relógio nem do provedor): sinais, preenchimentos e patrimônio saem iguais, linha a linha.
async function checkReplay(
  context: { readonly handle: DatabaseHandle; readonly client: Bun.SQL },
  run: OwnerRun,
  periodStart: number,
): Promise<void> {
  const { handle, client } = context;
  await createRunRepository(handle).transitionRun(run.scope, { runId: run.runId, to: 'cancelled' });
  const until = Number((await readRun(client, run.runId))?.last_candle_time);
  // O mundo muda: os relatórios passariam a "chegar tarde". Quem recalculasse daria outro resultado; o replay lê só a entrada gravada.
  await client`UPDATE model_team_reports SET decided_at = decided_at + interval '2 hours' WHERE team_key = 'lucas' AND kind = 'scheduled'`;
  const replayId = await createTeamRun(handle, run.scope, {
    versionId: run.versionId,
    periodStart,
  });
  await client`INSERT INTO team_run_inputs (run_id, candle_time, user_id, report_id, failure_code, applied_action)
    SELECT ${replayId}, candle_time, user_id, report_id, failure_code, applied_action FROM team_run_inputs WHERE run_id = ${run.runId}`;
  await waitForCandle(client, replayId, until);
  const original = await readCurve(client, run.runId, until);
  const replayed = await readCurve(client, replayId, until);
  assertCondition(original.length > 0, 'a execução original gravou resultados');
  assertCondition(
    JSON.stringify(original) === JSON.stringify(replayed),
    'o replay não reproduziu sinais, preenchimentos e patrimônio da execução original',
  );
  await createRunRepository(handle).transitionRun(run.scope, { runId: replayId, to: 'cancelled' });
  reportCheck(
    `execução de equipe: replay das entradas gravadas deu ${original.length} linhas iguais`,
  );
}

export async function checkTeamRun(context: {
  readonly handle: DatabaseHandle;
  readonly client: Bun.SQL;
  readonly lastOpen: number;
}): Promise<void> {
  const { handle, client, lastOpen } = context;
  const owner = await resolvePersistenceOwner(handle, 'subject-team-run-test');
  await createUserModelTeamRepository(handle).setEnabled(owner.scope, {
    teamKey: 'lucas',
    isEnabled: true,
  });
  const versionId = await seedStrategy(handle, owner.scope);
  const reportTime = lastOpen - REPORT_CANDLES_BEFORE_LAST * CANDLE_MILLISECONDS;
  await seedDecidedReport(client, reportTime);
  const periodStart = lastOpen - RUN_STARTS_CANDLES_BEFORE_LAST * CANDLE_MILLISECONDS;
  const runId = await createTeamRun(handle, owner.scope, { versionId, periodStart });
  const run: OwnerRun = { runId, versionId, scope: owner.scope };
  await checkBuyAtNextOpen(client, run, reportTime);
  await checkReplay({ handle, client }, run, periodStart);
}
