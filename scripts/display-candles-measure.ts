// Copyright (c) 2026 Ada Technology. All rights reserved.
// Só SELECT (spec 017, T0.2/T2.4): conta as velas de 3 min por par e confere, em bigint de escala 8 e sem importar o `src`,
// que as 5 velas de 3 min de cada janela de 15 min são IGUAIS à vela de 15 min gravada (OHLCV e trade_count).
// Uso: bun --env-file=envs/env.dev run scripts/display-candles-measure.ts
export const SLOTS_PER_FIFTEEN_MINUTES = 5;
const FIFTEEN_MINUTES = 900_000;
const THREE_MINUTES = 180_000;
const SLOTS = FIFTEEN_MINUTES / THREE_MINUTES;
if (SLOTS !== SLOTS_PER_FIFTEEN_MINUTES) throw new Error('grade de 3 min inconsistente');
const SCALE_8 = 100_000_000n;
const MAX_LISTED_DIVERGENCES = 20;
const EXCHANGE = 'binance';

type Row = {
  readonly open_time: string | number | bigint;
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
  readonly volume: string;
  readonly trade_count: number;
};

type Divergence = { readonly symbol: string; readonly openTime: number; readonly field: string };

function toScaled(text: string): bigint {
  const [whole = '0', fraction = ''] = text.split('.');
  return BigInt(whole) * SCALE_8 + BigInt(fraction.padEnd(8, '0').slice(0, 8));
}

function compare(symbol: string, fifteen: Row, parts: readonly Row[]): readonly Divergence[] {
  const first = parts[0];
  const last = parts[SLOTS - 1];
  if (first === undefined || last === undefined) return [];
  const openTime = Number(fifteen.open_time);
  // Vela sem negócio (volume 0, trade_count 0) carrega o fechamento anterior: não define abertura, máxima nem mínima.
  const active = parts.filter((part) => part.trade_count > 0);
  const priced = active.length > 0 ? active : parts;
  const highs = priced.map((part) => toScaled(part.high));
  const lows = priced.map((part) => toScaled(part.low));
  const checks: readonly (readonly [string, boolean])[] = [
    ['open', toScaled((priced[0] ?? first).open) === toScaled(fifteen.open)],
    ['close', toScaled(last.close) === toScaled(fifteen.close)],
    ['high', highs.reduce((a, b) => (b > a ? b : a)) === toScaled(fifteen.high)],
    ['low', lows.reduce((a, b) => (b < a ? b : a)) === toScaled(fifteen.low)],
    [
      'volume',
      parts.reduce((sum, part) => sum + toScaled(part.volume), 0n) === toScaled(fifteen.volume),
    ],
    ['trade_count', parts.reduce((sum, part) => sum + part.trade_count, 0) === fifteen.trade_count],
  ];
  return checks.filter(([, isEqual]) => !isEqual).map(([field]) => ({ symbol, openTime, field }));
}

async function readSeries(sql: Bun.SQL, symbol: string, timeframe: string): Promise<Row[]> {
  const rows: unknown = await sql`
    SELECT open_time, open::text, high::text, low::text, close::text, volume::text, trade_count
    FROM candles WHERE exchange = ${EXCHANGE} AND symbol = ${symbol} AND timeframe = ${timeframe}
    ORDER BY open_time`;
  return [...(rows as readonly Row[])];
}

type SymbolReport = {
  readonly symbol: string;
  readonly threeMinute: number;
  readonly checked: number;
  readonly incomplete: number;
  readonly divergences: readonly Divergence[];
};

async function checkSymbol(sql: Bun.SQL, symbol: string): Promise<SymbolReport> {
  const threes = await readSeries(sql, symbol, '3m');
  const fifteens = await readSeries(sql, symbol, '15m');
  const byWindow = new Map<number, Row[]>();
  for (const row of threes) {
    const windowStart = Math.floor(Number(row.open_time) / FIFTEEN_MINUTES) * FIFTEEN_MINUTES;
    byWindow.set(windowStart, [...(byWindow.get(windowStart) ?? []), row]);
  }
  const divergences: Divergence[] = [];
  let checked = 0;
  let incomplete = 0;
  for (const fifteen of fifteens) {
    const parts = byWindow.get(Number(fifteen.open_time));
    if (parts === undefined) continue;
    if (parts.length !== SLOTS) {
      incomplete += 1;
      continue;
    }
    checked += 1;
    divergences.push(...compare(symbol, fifteen, parts));
  }
  return { symbol, threeMinute: threes.length, checked, incomplete, divergences };
}

async function listSymbols(sql: Bun.SQL): Promise<readonly string[]> {
  const rows: unknown = await sql`
    SELECT DISTINCT symbol FROM candles WHERE timeframe = '3m' ORDER BY symbol`;
  return (rows as readonly { readonly symbol: string }[]).map((row) => row.symbol);
}

async function main(): Promise<void> {
  const url = Bun.env['DATABASE_URL'];
  if (url === undefined) throw new Error('DATABASE_URL ausente');
  const sql = new Bun.SQL(url);
  try {
    const reports: SymbolReport[] = [];
    for (const symbol of await listSymbols(sql)) reports.push(await checkSymbol(sql, symbol));
    for (const report of reports) {
      console.log(
        `${report.symbol}: 3m=${report.threeMinute} janelas de 15 min conferidas=${report.checked} incompletas=${report.incomplete} divergencias=${report.divergences.length}`,
      );
    }
    const all = reports.flatMap((report) => report.divergences);
    for (const item of all.slice(0, MAX_LISTED_DIVERGENCES)) {
      console.log(`DIVERGE ${item.symbol} ${new Date(item.openTime).toISOString()} ${item.field}`);
    }
    console.log(
      `total: pares=${reports.length} conferidas=${reports.reduce((sum, r) => sum + r.checked, 0)} divergencias=${all.length}`,
    );
    if (all.length > 0) process.exitCode = 1;
  } finally {
    await sql.close();
  }
}

await main();
