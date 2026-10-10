// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  BACKFILL_TASK_NAME,
  CRON_ENTRYPOINT,
  FINISHED_MESSAGE,
  type BackfillTimeframe,
} from './backfill-test.constant.js';

const REPOSITORY_ROOT: string = new URL('../../', import.meta.url).pathname;

export type BackfillRun = {
  readonly exitCode: number;
  readonly output: string;
  readonly summary: Readonly<Record<string, unknown>>;
};

export type BackfillRunParams = {
  readonly databaseUrl: string;
  readonly baseUrl: string;
  readonly symbols: readonly string[];
  readonly timeframes: readonly BackfillTimeframe[];
  readonly years: number;
};

function findSummary(output: string): Readonly<Record<string, unknown>> {
  const line = output.split('\n').find((candidate) => candidate.includes(FINISHED_MESSAGE));
  if (line === undefined) return {};
  const parsed: unknown = JSON.parse(line);
  return typeof parsed === 'object' && parsed !== null
    ? Object.fromEntries(Object.entries(parsed))
    : {};
}

// O mesmo ponto de entrada de produção, só com a tarefa de backfill e a Binance falsa.
export async function runBackfill(params: BackfillRunParams): Promise<BackfillRun> {
  const child = Bun.spawn([process.execPath, 'run', CRON_ENTRYPOINT], {
    cwd: REPOSITORY_ROOT,
    env: {
      ...Bun.env,
      DATABASE_URL: params.databaseUrl,
      CRON_TASKS: BACKFILL_TASK_NAME,
      BINANCE_BASE_URL: params.baseUrl,
      MARKET_SYMBOLS: params.symbols.join(','),
      MARKET_TIMEFRAMES: params.timeframes.join(','),
      BACKFILL_YEARS: String(params.years),
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const exitCode = await child.exited;
  return { exitCode, output: `${stdout}${stderr}`, summary: findSummary(stdout) };
}
