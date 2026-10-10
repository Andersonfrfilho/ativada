// Copyright (c) 2026 Ada Technology. All rights reserved.
import { loadClassicScoreboard } from '../../test/fixtures/strategy-engine/engine-scenarios.fixture.js';
import { HOUR_MILLISECONDS, SUBJECT_A, SYMBOL } from './api-runs-test.constant.js';
import {
  assertCondition,
  countRows,
  reportLine,
  type ApiRunsContext,
} from './api-runs-test-context.js';
import {
  dataOf,
  isFinished,
  readPages,
  splitCsv,
  strictlyIncreasing,
  waitForRun,
  type RunData,
} from './api-runs-helpers.js';
import { startHealthProbe } from './health-probe.js';

export type BacktestFlowResult = {
  readonly strategyId: string;
  readonly versionId: string;
  readonly runId: string;
};

type StrategyBody = {
  readonly strategy: { readonly id: string };
  readonly version: { readonly id: string; readonly version: number };
};

export type SeriesWindow = { readonly periodStart: number; readonly periodEnd: number };

async function checkAuthAndCandles(context: ApiRunsContext, window: SeriesWindow): Promise<void> {
  const anonymous = await context.call({ path: '/v1/runs' });
  assertCondition(anonymous.status === 401, `sem token: ${anonymous.status}`);
  const from = window.periodStart;
  const to = from + 24 * HOUR_MILLISECONDS;
  const candles = dataOf<readonly { openTime: number; open: string }[]>(
    await context.call({
      subject: SUBJECT_A,
      path: `/v1/markets/candles?symbol=${SYMBOL}&timeframe=1h&from=${from}&to=${to}`,
    }),
    200,
  );
  assertCondition(candles.length === 24, `candles de 24 h: ${candles.length}`);
  assertCondition(
    candles[0]?.openTime === from && typeof candles[0].open === 'string',
    'primeiro candle',
  );
  const tooMany = await context.call({
    subject: SUBJECT_A,
    path: `/v1/markets/candles?symbol=${SYMBOL}&timeframe=1h&from=${from}&to=${from + 5_001 * HOUR_MILLISECONDS}`,
  });
  assertCondition(tooMany.status === 400, `5.001 candles: ${tooMany.status}`);
  reportLine(
    '401 sem token; candles do banco (from incluído, to excluído, decimais como texto) e teto de 5.000',
  );
}

async function checkStrategyRoutes(context: ApiRunsContext): Promise<StrategyBody> {
  const config = loadClassicScoreboard();
  const created = dataOf<StrategyBody>(
    await context.call({
      subject: SUBJECT_A,
      method: 'POST',
      path: '/v1/strategies',
      body: { name: 'Placar clássico', config },
    }),
    201,
  );
  assertCondition(created.version.version === 1, 'versão 1');
  const same = await context.call({
    subject: SUBJECT_A,
    method: 'POST',
    path: `/v1/strategies/${created.strategy.id}/versions`,
    body: { config },
  });
  assertCondition(
    same.status === 200 &&
      dataOf<{ version: { id: string } }>(same, 200).version.id === created.version.id,
    'configuração igual devolve a MESMA versão (200)',
  );
  const changed = structuredClone(config) as { thresholds: { buy: string } };
  changed.thresholds.buy = '2.5';
  const second = await context.call({
    subject: SUBJECT_A,
    method: 'POST',
    path: `/v1/strategies/${created.strategy.id}/versions`,
    body: { config: changed },
  });
  assertCondition(second.status === 201, `versão nova: ${second.status}`);
  const detail = dataOf<{ latestVersion: { version: number } }>(
    await context.call({ subject: SUBJECT_A, path: `/v1/strategies/${created.strategy.id}` }),
    200,
  );
  assertCondition(detail.latestVersion.version === 2, 'o detalhe traz a versão mais recente');
  reportLine(
    'estratégia → versão 1 → mesma configuração (200, mesma versão) → versão 2 (201), pelo Postgres real',
  );
  return created;
}

async function runBacktest(
  context: ApiRunsContext,
  versionId: string,
  window: SeriesWindow,
): Promise<RunData> {
  const accepted = await context.call({
    subject: SUBJECT_A,
    method: 'POST',
    path: '/v1/runs',
    body: {
      strategyVersionId: versionId,
      kind: 'backtest',
      symbol: SYMBOL,
      timeframe: '1h',
      periodStart: window.periodStart,
      periodEnd: window.periodEnd,
    },
  });
  const queued = dataOf<RunData>(accepted, 202);
  assertCondition(
    queued.status === 'queued' || queued.status === 'running',
    `status ${queued.status}`,
  );
  const probe = startHealthProbe(context, 'o backtest de 2 anos disparado pela API');
  const startedAt = performance.now();
  const finished = await waitForRun(context, {
    subject: SUBJECT_A,
    runId: queued.id,
    until: isFinished,
    label: 'backtest',
  });
  const elapsed = performance.now() - startedAt;
  await probe.stop();
  assertCondition(
    finished.status === 'completed',
    `backtest terminou ${finished.status} ${String(finished.errorCode)}`,
  );
  assertCondition(
    finished.progress === 100 && finished.metrics !== null,
    'progresso 100 e métricas',
  );
  reportLine(
    `backtest de 2 anos em 1h criado por POST /v1/runs e acompanhado até completed em ${elapsed.toFixed(0)} ms`,
  );
  return finished;
}

async function checkSeries(context: ApiRunsContext, runId: string): Promise<void> {
  const equity = await readPages(context, {
    subject: SUBJECT_A,
    path: `/v1/runs/${runId}/equity`,
    maxPages: 3,
  });
  assertCondition(
    equity.rows.length === 300 && !equity.isComplete,
    `equity: ${equity.rows.length} linhas em 3 páginas`,
  );
  assertCondition(
    strictlyIncreasing(equity.rows.map((row) => Number(row['candleTime']))),
    'equity em ordem, sem repetir',
  );
  const stored: unknown =
    await context.client`SELECT candle_time, equity::text AS equity FROM equity_points WHERE run_id = ${runId} ORDER BY candle_time LIMIT 300`;
  const sameRows = (stored as { candle_time: number; equity: string }[]).every(
    (row, index) =>
      equity.rows[index]?.['equity'] === row.equity &&
      equity.rows[index]?.['candleTime'] === Number(row.candle_time),
  );
  assertCondition(sameRows, 'as 300 primeiras linhas da API são as do banco, valor a valor');
  const trades = await readPages(context, {
    subject: SUBJECT_A,
    path: `/v1/runs/${runId}/trades`,
    maxPages: 60,
  });
  const tradeCount = await countRows(context.client, 'positions', runId);
  assertCondition(
    trades.isComplete && trades.rows.length === tradeCount,
    `trades: ${trades.rows.length} de ${tradeCount}`,
  );
  const signals = await readPages(context, {
    subject: SUBJECT_A,
    path: `/v1/runs/${runId}/signals`,
    maxPages: 2,
  });
  assertCondition(
    signals.rows.length === 200 && typeof signals.rows[0]?.['reason'] === 'string',
    'sinais com motivo',
  );
  const orders = await readPages(context, {
    subject: SUBJECT_A,
    path: `/v1/runs/${runId}/orders`,
    maxPages: 2,
  });
  const fills = await readPages(context, {
    subject: SUBJECT_A,
    path: `/v1/runs/${runId}/fills`,
    maxPages: 2,
  });
  assertCondition(orders.rows.length > 0 && fills.rows.length > 0, 'ordens e preenchimentos');
  const windows = await readPages(context, {
    subject: SUBJECT_A,
    path: `/v1/runs/${runId}/windows`,
    maxPages: 1,
  });
  assertCondition(windows.rows.length === 0, 'backtest não tem janelas');
  reportLine(
    `séries paginadas por cursor: patrimônio (300 linhas = as do banco), ${tradeCount} operações completas, sinais, ordens, preenchimentos; janelas vazias`,
  );
}

const LOG_HEADER =
  'time,event,action,side,order_key,order_type,purpose,status,score,regime,price,limit_price,trigger_price,quantity,notional,fee,risk_amount,stop_distance,target_distance,last_event_time,reason';
const LOG_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

// O registro cronológico (T4.6): sinais, ordens e preenchimentos NUMA linha do tempo só, como o banco os gravou.
async function checkLogCsv(context: ApiRunsContext, runId: string): Promise<void> {
  const response = await context.call({ subject: SUBJECT_A, path: `/v1/runs/${runId}/log.csv` });
  assertCondition(response.status === 200, `log.csv: ${response.status}`);
  assertCondition(
    response.headers.get('content-type') === 'text/csv; charset=utf-8',
    'content-type do log',
  );
  assertCondition(
    response.headers.get('content-disposition') === `attachment; filename="run-${runId}-log.csv"`,
    'nome do arquivo do log',
  );
  const parsed = splitCsv(response.text);
  assertCondition(parsed.header === LOG_HEADER, `cabeçalho do log: ${parsed.header}`);
  const expected =
    (await countRows(context.client, 'signals', runId)) +
    (await countRows(context.client, 'orders', runId)) +
    (await countRows(context.client, 'fills', runId));
  assertCondition(
    parsed.lines.length === expected,
    `log: ${parsed.lines.length} linhas de ${expected}`,
  );
  const times = parsed.lines.map((line) => line.split(',')[0] ?? '');
  assertCondition(
    times.every((time) => LOG_TIME_PATTERN.test(time)),
    'tempo fora de UTC ISO',
  );
  assertCondition(
    times.every((time, index) => index === 0 || (times[index - 1] ?? '') <= time),
    'log fora de ordem cronológica',
  );
  const events = new Set(parsed.lines.map((line) => line.split(',')[1]));
  assertCondition(
    ['signal', 'order', 'fill'].every((event) => events.has(event)),
    'faltou um tipo de evento no log',
  );
  const fill: unknown =
    await context.client`SELECT order_key, price::text AS price, notional::text AS notional FROM fills WHERE run_id = ${runId} ORDER BY candle_time, order_key LIMIT 1`;
  const first = (fill as { order_key: string; price: string; notional: string }[])[0];
  assertCondition(
    parsed.lines.some(
      (line) =>
        line.includes(`,fill,`) &&
        line.includes(`,${first?.order_key},`) &&
        line.includes(`,${first?.price},`) &&
        line.includes(`,${first?.notional},`),
    ),
    'o preenchimento do banco não está no log com os decimais exatos',
  );
  assertCondition(
    !/user_id|userId|run_hash|config_hash/.test(response.text),
    'log vazou dado interno',
  );
  reportLine(
    `registro CSV (log.csv): cabeçalho fixo, ${parsed.lines.length} linhas = sinais + ordens + preenchimentos do banco, tempos em UTC ISO em ordem, decimais exatos`,
  );
}

async function checkCsv(context: ApiRunsContext, runId: string): Promise<void> {
  for (const [table, source, header] of [
    ['equity', 'equity_points', 'candle_time,equity,equity_at_low,benchmark'],
    [
      'trades',
      'positions',
      'engine_key,status,entry_price,quantity,stop_price,target_price,entry_fee,exit_price,exit_fee,net_profit,exit_reason,opened_candle_time,closed_candle_time',
    ],
    [
      'signals',
      'signals',
      'candle_time,action,score,regime,reason,votes,indicators,sentiment_observation',
    ],
  ] as const) {
    const response = await context.call({
      subject: SUBJECT_A,
      path: `/v1/runs/${runId}/export.csv?table=${table}`,
    });
    assertCondition(response.status === 200, `CSV ${table}: ${response.status}`);
    assertCondition(
      response.headers.get('content-type') === 'text/csv; charset=utf-8',
      `content-type ${table}`,
    );
    assertCondition(response.headers.get('cache-control') === 'no-store', `no-store ${table}`);
    assertCondition(
      (response.headers.get('content-disposition') ?? '').startsWith('attachment; filename="'),
      `attachment ${table}`,
    );
    const parsed = splitCsv(response.text);
    const expected = await countRows(context.client, source, runId);
    assertCondition(parsed.header === header, `cabeçalho ${table}: ${parsed.header}`);
    assertCondition(
      parsed.lines.length === expected,
      `CSV ${table}: ${parsed.lines.length} linhas de ${expected}`,
    );
    assertCondition(
      !/user_id|userId|run_hash|config_hash/.test(response.text),
      `CSV ${table} vazou dado interno`,
    );
  }
  const equityRow =
    splitCsv(
      (
        await context.call({
          subject: SUBJECT_A,
          path: `/v1/runs/${runId}/export.csv?table=equity`,
        })
      ).text,
    ).lines[0] ?? '';
  const first: unknown =
    await context.client`SELECT candle_time, equity::text AS equity, equity_at_low::text AS low, benchmark::text AS benchmark FROM equity_points WHERE run_id = ${runId} ORDER BY candle_time LIMIT 1`;
  const row = (
    first as { candle_time: number; equity: string; low: string; benchmark: string }[]
  )[0];
  assertCondition(
    equityRow === `${row?.candle_time},${row?.equity},${row?.low},${row?.benchmark}`,
    `primeira linha do CSV: ${equityRow}`,
  );
  reportLine(
    'CSV (equity, trades, signals): cabeçalho fixo, UTF-8, anexo, no-store, uma linha por registro do banco, decimal exato e sem user_id nem hash',
  );
  const stopped = await context.call({
    subject: SUBJECT_A,
    method: 'POST',
    path: `/v1/runs/${runId}/stop`,
  });
  assertCondition(stopped.status === 409, `parar execução concluída: ${stopped.status}`);
}

export async function checkBacktestFlow(
  context: ApiRunsContext,
  window: SeriesWindow,
): Promise<BacktestFlowResult> {
  await checkAuthAndCandles(context, window);
  const strategy = await checkStrategyRoutes(context);
  const run = await runBacktest(context, strategy.version.id, window);
  await checkSeries(context, run.id);
  await checkCsv(context, run.id);
  await checkLogCsv(context, run.id);
  return { strategyId: strategy.strategy.id, versionId: strategy.version.id, runId: run.id };
}
