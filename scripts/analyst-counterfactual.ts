// Copyright (c) 2026 Ada Technology. All rights reserved.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { readDatabaseUrl } from '../packages/database/src/read-database-url.js';
import type {
  JobResult,
  PairData,
  StrategyKey,
} from './analyst-counterfactual/counterfactual.types.js';
import { runJob } from './analyst-counterfactual/job.js';
import { renderReport } from './analyst-counterfactual/render.js';
import {
  closeDatabase,
  openSource,
  readFearGreed,
  readPair,
} from './risk-analyst-baseline/market-source.js';

// T2.4 da spec 007 (RF12, plan D9): o que o analista TERIA feito, em memória. Para cada par (LINK, BNB, BTC, ETH) e cada
// estratégia (Placar clássico, Reversão), 183 dias de 15 min do banco de dev: a estratégia sozinha × a mesma com o analista
// governando uma carteira em memória, e o veredito D11 (diferença de resultado por semana, com o Wilson).
// SOMENTE LEITURA: velas e Fear & Greed vêm de `SELECT` pelos repositórios do repo; nenhuma linha vai a `runs`,
// `analyst_decisions` ou qualquer tabela. Uso:
//   bun run scripts/analyst-counterfactual.ts --job LINKUSDT:classic --out dir/LINKUSDT-classic.json
//   bun run scripts/analyst-counterfactual.ts --report dir [--out relatorio.md]
//   bun run scripts/analyst-counterfactual.ts --counts   (linhas de runs e analyst_decisions, para provar que nada mudou)

const SYMBOLS = ['LINKUSDT', 'BNBUSDT', 'BTCUSDT', 'ETHUSDT'] as const;
const STRATEGIES: readonly StrategyKey[] = ['classic', 'reversion'];
const SENTIMENT_SOURCE = 'alternative.me';

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function isStrategyKey(value: string): value is StrategyKey {
  return STRATEGIES.some((key) => key === value);
}

async function loadPair(symbol: string): Promise<PairData> {
  const handle = openSource();
  try {
    const [pair, fearGreed] = await Promise.all([
      readPair(handle, { symbol, timeframe: '15m' }),
      readFearGreed(handle),
    ]);
    return {
      market: pair.market,
      candles: pair.candles,
      observations: fearGreed.map((day) => ({
        value: day.value,
        observedAt: day.observedAt,
        source: SENTIMENT_SOURCE,
        createdAt: day.observedAt,
      })),
    };
  } finally {
    await closeDatabase(handle);
  }
}

async function runOne(target: string, out: string | undefined): Promise<void> {
  const [symbol = '', strategy = ''] = target.split(':');
  if (!isStrategyKey(strategy) || !SYMBOLS.some((known) => known === symbol)) {
    throw new Error('--job espera PAR:classic ou PAR:reversion com um dos 4 pares');
  }
  const startedAt = Date.now();
  const result = await runJob({ pair: await loadPair(symbol), strategy });
  if (out !== undefined) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(result)}\n`);
  }
  process.stdout.write(
    `${symbol}:${strategy} pronto em ${Math.round((Date.now() - startedAt) / 1000)} s\n`,
  );
}

function readJobs(directory: string): JobResult[] {
  const names = readdirSync(directory).filter((name) => name.endsWith('.json'));
  const jobs = names.map(
    (name) => JSON.parse(readFileSync(`${directory}/${name}`, 'utf8')) as JobResult,
  );
  const order = (job: JobResult): number =>
    SYMBOLS.findIndex((symbol) => symbol === job.symbol) * STRATEGIES.length +
    STRATEGIES.findIndex((key) => key === job.strategy);
  return jobs.sort((first, second) => order(first) - order(second));
}

type CountRow = { readonly total: number };
type ExistsRow = { readonly present: boolean };

async function countRows(client: Bun.SQL, table: string): Promise<number> {
  const rows: unknown = await client.unsafe(`SELECT count(*)::int AS total FROM ${table}`);
  return (rows as readonly CountRow[])[0]?.total ?? 0;
}

// Só `SELECT`: as linhas de `runs` e de `analyst_decisions` (se a tabela já existe neste banco), antes e depois da medição.
async function printCounts(): Promise<void> {
  const client = new Bun.SQL(readDatabaseUrl());
  try {
    const exists: unknown = await client.unsafe(
      "SELECT to_regclass('public.analyst_decisions') IS NOT NULL AS present",
    );
    const hasDecisions = (exists as readonly ExistsRow[])[0]?.present === true;
    const decisions = hasDecisions
      ? String(await countRows(client, 'analyst_decisions'))
      : 'a tabela ainda não existe neste banco';
    process.stdout.write(
      `runs=${await countRows(client, 'runs')} analyst_decisions=${decisions}\n`,
    );
  } finally {
    await client.close();
  }
}

async function main(): Promise<void> {
  const job = readFlag('--job');
  const report = readFlag('--report');
  if (process.argv.includes('--counts')) return printCounts();
  if (job !== undefined) return runOne(job, readFlag('--out'));
  if (report !== undefined) {
    const text = renderReport(readJobs(report));
    const out = readFlag('--out');
    if (out === undefined) process.stdout.write(`${text}\n`);
    else writeFileSync(out, `${text}\n`);
    return;
  }
  throw new Error('use --job PAR:estrategia, --report DIRETORIO ou --counts');
}

try {
  await main();
} catch (error: unknown) {
  process.stderr.write(
    `analyst-counterfactual: FALHOU - ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
