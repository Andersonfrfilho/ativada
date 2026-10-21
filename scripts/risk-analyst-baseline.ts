// Copyright (c) 2026 Ada Technology. All rights reserved.
import { summarizeAuditor } from '../test/fixtures/risk-analyst/auditor-oracle.fixture.js';
import { buildRealAuditorSeries } from '../test/fixtures/risk-analyst/real-series.fixture.js';
import {
  AUDITED_KEYS,
  type AuditedKey,
} from '../test/fixtures/risk-analyst/specialist-dataset.fixture.js';
import {
  closeDatabase,
  DAY,
  openSource,
  readFearGreed,
  readPair,
  type PairSeries,
  type Timeframe,
} from './risk-analyst-baseline/market-source.js';
import { checkAgainstPreview } from './risk-analyst-baseline/preview-009.js';
import {
  assertAgainstSharedWilson,
  renderTable,
  type ReportRow,
} from './risk-analyst-baseline/render.js';
import { writeSlice } from './risk-analyst-baseline/write-slice.js';

// T0.2 da spec 007: medição de base do auditor `analyst-1` com velas e Fear & Greed REAIS do banco de dev. SOMENTE LEITURA.
// Uso: `DATABASE_URL=… bun run scripts/risk-analyst-baseline.ts [--write-slice]`.

const SYMBOLS = ['LINKUSDT', 'BNBUSDT', 'BTCUSDT', 'ETHUSDT'] as const;
const TIMEFRAMES: readonly Timeframe[] = ['15m', '1h'];
const DURATION: Record<Timeframe, number> = { '15m': 900_000, '1h': 3_600_000 };
const SIX_MONTHS_DAYS = 183;
const CONTRACT_WINDOW = 2880;
const LEAD_IN = 200;
const ITEM_LABEL: Record<AuditedKey, string> = {
  trend: 'Tendência',
  reversion: 'Reversão',
  volume: 'Volume',
  sentiment: 'Sentimento',
  strategy: 'Placar clássico',
};

type FearGreed = Awaited<ReturnType<typeof readFearGreed>>;
type Windows = {
  readonly sixMonths: ReportRow[];
  readonly contract: ReportRow[];
  readonly full: ReportRow[];
};

function describeCoverage(params: {
  readonly symbol: string;
  readonly timeframe: Timeframe;
  readonly pair: PairSeries;
}): string {
  const { symbol, timeframe, pair } = params;
  const first = pair.candles[0]?.openTime ?? 0;
  const last = pair.candles.at(-1)?.openTime ?? 0;
  const missing = (last - first) / DURATION[timeframe] + 1 - pair.candles.length;
  return `| ${symbol} | ${timeframe} | ${pair.candles.length} | ${new Date(first).toISOString()} | ${new Date(last).toISOString()} | ${missing} |`;
}

function collect(params: {
  readonly windows: Windows;
  readonly symbol: string;
  readonly timeframe: Timeframe;
  readonly pair: PairSeries;
  readonly fearGreed: FearGreed;
}): void {
  const { windows, symbol, timeframe, pair, fearGreed } = params;
  const lastIndex = pair.candles.length - 1;
  const lastOpen = pair.candles[lastIndex]?.openTime ?? 0;
  const sixMonthsIndex = pair.candles.findIndex(
    (candle) => candle.openTime >= lastOpen - SIX_MONTHS_DAYS * DAY,
  );
  const targets: [ReportRow[], number][] = [
    [windows.sixMonths, lastIndex - sixMonthsIndex],
    [windows.contract, CONTRACT_WINDOW],
    [windows.full, lastIndex - LEAD_IN],
  ];
  for (const key of AUDITED_KEYS) {
    const series = buildRealAuditorSeries({
      candles: pair.candles,
      market: pair.market,
      key,
      fearGreed,
    });
    for (const [rows, windowCandles] of targets) {
      const summary = summarizeAuditor(series, {
        decisionTime: lastOpen,
        timeframeMilliseconds: DURATION[timeframe],
        windowCandles,
      });
      assertAgainstSharedWilson(summary);
      rows.push({ pair: symbol, timeframe, item: ITEM_LABEL[key], summary });
    }
  }
}

function provenOf(rows: readonly ReportRow[]): string[] {
  return rows
    .filter((row) => row.summary.verdict === 'above')
    .map((row) => `${row.pair} ${row.timeframe} ${row.item}`);
}

function print(params: {
  readonly windows: Windows;
  readonly coverage: readonly string[];
  readonly link1h: PairSeries | undefined;
}): void {
  const { windows } = params;
  console.log(
    '## Cobertura\n\n| Par | Vela | Velas | Primeira | Última | Faltando |\n|---|---|---|---|---|---|',
  );
  console.log(params.coverage.join('\n'));
  console.log(`\n## Últimos ${SIX_MONTHS_DAYS} dias (janela = todas as previsões do período)\n`);
  console.log(renderTable(windows.sixMonths));
  console.log('\n## Janela do contrato (2.880 velas mais novas)\n');
  console.log(renderTable(windows.contract));
  console.log('\n## Histórico inteiro do banco (cerca de 2 anos)\n');
  console.log(renderTable(windows.full));
  const proven = [windows.sixMonths, windows.contract, windows.full].map(provenOf);
  console.log(`\nprovam valor (6 meses | 2.880 | tudo): ${JSON.stringify(proven)}`);
  if (params.link1h !== undefined) {
    console.log(`\nconferência 009: ${JSON.stringify(checkAgainstPreview(params.link1h))}`);
  }
}

async function main(): Promise<void> {
  const handle = openSource();
  try {
    const fearGreed = await readFearGreed(handle);
    const windows: Windows = { sixMonths: [], contract: [], full: [] };
    const coverage: string[] = [];
    let link1h: PairSeries | undefined;
    for (const symbol of SYMBOLS) {
      for (const timeframe of TIMEFRAMES) {
        const pair = await readPair(handle, { symbol, timeframe });
        if (symbol === 'LINKUSDT' && timeframe === '1h') link1h = pair;
        if (symbol === 'BTCUSDT' && timeframe === '15m' && Bun.argv.includes('--write-slice')) {
          writeSlice({ pair, fearGreed });
        }
        coverage.push(describeCoverage({ symbol, timeframe, pair }));
        collect({ windows, symbol, timeframe, pair, fearGreed });
      }
    }
    print({ windows, coverage, link1h });
  } finally {
    await closeDatabase(handle);
  }
}

await main();
