// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createStrategyRepository } from '../../packages/database/src/index.js';
import { MODEL_TEAM_STRATEGY } from '../../packages/model-agents/src/index.js';
import { parseJsonContainer } from '../../packages/run-recording/src/index.js';
import { readPersistedRun } from '../backtest-test/read-run-rows.js';
import {
  buildTeamCandles,
  QUARTER_HOUR,
  TEAM_SYMBOL,
  teamCandleOpenTime,
} from '../../test/fixtures/model-teams/team-candles.fixture.js';
import {
  cadenceIndex,
  TEAM_CANDLE_COUNT,
  TEAM_LEAD_IN,
  TEAM_SETTINGS,
} from '../../test/fixtures/model-teams/team-live.fixture.js';
import {
  assertCondition,
  cancelRun,
  createLiveRun,
  createLiveUser,
  createProductionEvaluator,
  digestOf,
  errorsOf,
  readProgress,
  reportLine,
  seedCandles,
  tickUntilQuiet,
  type LiveTestContext,
  type LiveUser,
} from './live-test-context.js';

const BUY_INDEX = cadenceIndex(1);
const SELL_INDEX = cadenceIndex(2);
const DECIDED_AFTER_CLOSE_MILLISECONDS = 5_000;
const ROLES = JSON.stringify({
  trend: { stance: 'up', reason: 'Leitura de teste.' },
  risk: { level: 'medium', reason: 'Leitura de teste.' },
  decision: { reason: 'Gestor de teste.' },
});
const TEAM_REQUEST = parseJsonContainer(
  JSON.stringify({ signalSource: { kind: 'model_team', team: 'lucas' } }),
);

type InputRow = {
  readonly candle_time: string;
  readonly report_id: string | null;
  readonly failure_code: string | null;
  readonly applied_action: string;
};

async function seedTeamUser(context: LiveTestContext): Promise<LiveUser> {
  const user = await createLiveUser(context, 'team');
  const strategies = createStrategyRepository(context.handle);
  const strategy = await strategies.createStrategy(user.scope, {
    name: 'model-team-1',
    isExample: false,
  });
  const added = await strategies.addVersion(user.scope, {
    strategyId: strategy.id,
    config: parseJsonContainer(JSON.stringify(MODEL_TEAM_STRATEGY.config)),
    configHash: MODEL_TEAM_STRATEGY.configHash,
  });
  if (added === undefined) throw new Error('a versão model-team-1 não foi criada');
  return { ...user, versionId: added.version.id };
}

// O JSON entra como literal do SQL: um parâmetro de texto com `::jsonb` seria gravado como texto JSON dentro do jsonb.
async function seedDecidedReport(
  context: LiveTestContext,
  params: { readonly index: number; readonly action: 'buy' | 'sell' },
): Promise<string> {
  const id = Bun.randomUUIDv7();
  const decidedAt =
    teamCandleOpenTime(params.index) + QUARTER_HOUR + DECIDED_AFTER_CLOSE_MILLISECONDS;
  const levels = params.action === 'buy' ? '100.5, 102, 99.5' : 'NULL, NULL, NULL';
  await context.client
    .unsafe(`INSERT INTO model_team_reports (id, team_key, provider, model_id, prompt_version, kind, symbol, timeframe, candle_time, status, action, entry_price, target_price, stop_price, confidence, roles, decided_at)
    VALUES ('${id}', 'lucas', 'anthropic', 'fake-model-1', 'team-prompt-1', 'scheduled', '${TEAM_SYMBOL}', '15m', ${teamCandleOpenTime(params.index)}, 'decided', '${params.action}', ${levels}, 62, '${ROLES}'::jsonb, to_timestamp(${decidedAt} / 1000.0))`);
  return id;
}

async function runTeamRun(
  context: LiveTestContext,
  params: { readonly user: LiveUser; readonly instanceId: string },
): Promise<string> {
  const run = await createLiveRun(context, {
    symbol: TEAM_SYMBOL,
    timeframe: '15m',
    periodStart: teamCandleOpenTime(TEAM_LEAD_IN),
    user: params.user,
    request: TEAM_REQUEST,
  });
  return run.id;
}

async function evaluate(context: LiveTestContext, instanceId: string): Promise<number> {
  const { evaluator, entries } = createProductionEvaluator(context, {
    instanceId,
    team: TEAM_SETTINGS,
  });
  const totals = await tickUntilQuiet(evaluator);
  assertCondition(errorsOf(entries).length === 0, `${instanceId}: o avaliador registrou erro`);
  assertCondition(totals.failed === 0, `${instanceId}: a execução de equipe falhou`);
  return totals.steps;
}

async function readInputs(context: LiveTestContext, runId: string): Promise<readonly InputRow[]> {
  const rows: unknown = await context.client.unsafe(
    'SELECT candle_time::text, report_id::text, failure_code, applied_action FROM team_run_inputs WHERE run_id = $1 ORDER BY candle_time',
    [runId],
  );
  return rows as readonly InputRow[];
}

async function checkOriginal(
  context: LiveTestContext,
  params: {
    readonly runId: string;
    readonly user: LiveUser;
    readonly reportIds: readonly string[];
  },
): Promise<void> {
  const persisted = await readPersistedRun(context.backtest, params.runId, params.user);
  const fills = persisted.rows['fills'];
  assertCondition(Array.isArray(fills), 'a execução de equipe gravou preenchimentos');
  const sides = (fills as readonly { side: string; candleTime: number }[]).map((fill) => [
    fill.side,
    fill.candleTime,
  ]);
  assertCondition(
    JSON.stringify(sides) ===
      JSON.stringify([
        ['buy', teamCandleOpenTime(BUY_INDEX + 1)],
        ['sell', teamCandleOpenTime(SELL_INDEX + 1)],
      ]),
    `a compra e a venda decididas em t executam em t + 1 (achou ${JSON.stringify(sides)})`,
  );
  const inputs = await readInputs(context, params.runId);
  const byCandle = new Map(inputs.map((row) => [Number(row.candle_time), row]));
  assertCondition(
    byCandle.get(teamCandleOpenTime(BUY_INDEX))?.report_id === params.reportIds[0] &&
      byCandle.get(teamCandleOpenTime(BUY_INDEX))?.applied_action === 'buy',
    'a entrada gravada da vela de compra aponta o relatório e a ação aplicada',
  );
  assertCondition(
    inputs.some((row) => row.failure_code === 'MISSING') &&
      inputs.some((row) => row.failure_code === 'NOT_SCHEDULED'),
    'vela sem relatório grava MISSING e vela fora do ritmo grava NOT_SCHEDULED',
  );
  const first = Math.min(...inputs.map((row) => Number(row.candle_time)));
  assertCondition(
    first >= teamCandleOpenTime(TEAM_LEAD_IN - 1),
    'o aquecimento (sinal nulo) não grava entrada',
  );
}

// T3.3 contra o Postgres: a execução de equipe lê o relatório gravado, compra e vende em t + 1, e o REPLAY a partir das
// entradas gravadas (mesmo com o mundo mudado: os relatórios passam a chegar "tarde") dá as mesmas linhas, sem consultar nada.
export async function checkTeamRun(context: LiveTestContext): Promise<void> {
  const user = await seedTeamUser(context);
  await seedCandles(context, buildTeamCandles(TEAM_CANDLE_COUNT), { allowFuture: true });
  const reportIds = [
    await seedDecidedReport(context, { index: BUY_INDEX, action: 'buy' }),
    await seedDecidedReport(context, { index: SELL_INDEX, action: 'sell' }),
  ];
  const runId = await runTeamRun(context, { user, instanceId: 'team-original' });
  const steps = await evaluate(context, 'team-original');
  assertCondition(steps === TEAM_CANDLE_COUNT, `a execução de equipe deu ${steps} passos`);
  await checkOriginal(context, { runId, user, reportIds });
  await cancelRun(context, { runId, user });
  const original = await readPersistedRun(context.backtest, runId, user);

  await context.client.unsafe(
    `UPDATE model_team_reports SET decided_at = decided_at + interval '2 hours' WHERE symbol = '${TEAM_SYMBOL}'`,
  );
  const replayId = await runTeamRun(context, { user, instanceId: 'team-replay' });
  await context.client`INSERT INTO team_run_inputs (run_id, candle_time, user_id, report_id, failure_code, applied_action)
    SELECT ${replayId}, candle_time, user_id, report_id, failure_code, applied_action FROM team_run_inputs WHERE run_id = ${runId}`;
  const replaySteps = await evaluate(context, 'team-replay');
  assertCondition(replaySteps === TEAM_CANDLE_COUNT, `o replay deu ${replaySteps} passos`);
  const replayed = await readPersistedRun(context.backtest, replayId, user);
  assertCondition(
    digestOf(replayed.rows) === digestOf(original.rows),
    'o replay não reproduziu as linhas da execução de equipe',
  );
  assertCondition(
    JSON.stringify(replayed.engineState) === JSON.stringify(original.engineState),
    'o replay não deixou o mesmo estado do motor',
  );
  const progress = await readProgress(context, replayId);
  assertCondition(progress.status === 'running', 'o replay segue rodando');
  await cancelRun(context, { runId: replayId, user });
  reportLine(
    `equipe: ${original.counts['fills']} preenchimentos em t + 1, entradas gravadas por vela e replay IDÊNTICO (digest ${digestOf(original.rows).slice(0, 16)}) mesmo com os relatórios passando a "tarde"`,
  );
}
