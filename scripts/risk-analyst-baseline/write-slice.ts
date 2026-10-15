// Copyright (c) 2026 Ada Technology. All rights reserved.
import { writeFileSync } from 'node:fs';

import {
  summarizeAuditor,
  type AuditorSummary,
} from '../../test/fixtures/risk-analyst/auditor-oracle.fixture.js';
import {
  buildRealAuditorSeries,
  type FearGreedDay,
} from '../../test/fixtures/risk-analyst/real-series.fixture.js';
import { AUDITED_KEYS } from '../../test/fixtures/risk-analyst/specialist-dataset.fixture.js';
import type { PairSeries } from './market-source.js';

// Grava o recorte de 15 min do dourado (ADR 0002, "Analista de risco (spec 007)"): BTCUSDT 15m, 3.300 velas até
// 2026-10-14 23:45 UTC (2.880 da janela + 200 de aquecimento + folga da âncora diária) e o Fear & Greed REAL do período.

export const SLICE_CANDLES = 3_300;
export const SLICE_END_EXCLUSIVE = Date.UTC(2026, 9, 15);
const FIFTEEN_MINUTES = 900_000;
const SLICE_NAME = 'btcusdt-15m-3300';
const FEAR_GREED_LEAD_DAYS = 3;
const DAY = 86_400_000;
const WINDOWS = [2880, 96] as const;
const FIXTURE_DIRECTORY = 'test/fixtures/risk-analyst';

const GOLDEN_HEADER = [
  '// Copyright (c) 2026 Ada Technology. All rights reserved.',
  '',
  '// Dourado do auditor `analyst-1` no recorte REAL de 15 min (T0.2 da spec 007): BTCUSDT 15m, 3.300 velas até',
  '// 2026-10-14 23:45 UTC e o Fear & Greed real do banco de dev; decisão na última vela, janelas de 2.880 e 96.',
  '// Mesmo formato do `auditor-golden`. Regravar: `bun run scripts/risk-analyst-baseline.ts --write-slice` (só leitura).',
  '',
].join('\n');

function goldenLine(summary: AuditorSummary): string {
  return [
    summary.predictions,
    summary.unread,
    summary.noSide,
    summary.gap,
    summary.hits,
    summary.misses,
    summary.ties,
    summary.upMoves,
    summary.hitRate ?? 'null',
    summary.upRate ?? 'null',
    summary.verdict,
    summary.lower ?? 'null',
    summary.upper ?? 'null',
    summary.weight,
  ].join(' ');
}

export function writeSlice(params: {
  readonly pair: PairSeries;
  readonly fearGreed: readonly FearGreedDay[];
}): void {
  const { pair } = params;
  const candles = pair.candles
    .filter((candle) => candle.openTime < SLICE_END_EXCLUSIVE)
    .slice(-SLICE_CANDLES);
  const first = candles[0];
  const last = candles.at(-1);
  if (first === undefined || last === undefined || candles.length !== SLICE_CANDLES) {
    throw new Error('o banco não tem as velas do recorte');
  }
  if (last.openTime - first.openTime !== (SLICE_CANDLES - 1) * FIFTEEN_MINUTES) {
    throw new Error('o recorte de 15 min tem buraco');
  }
  const fearGreed = params.fearGreed.filter(
    (day) =>
      day.observedAt >= first.openTime - FEAR_GREED_LEAD_DAYS * DAY &&
      day.observedAt <= last.closeTime,
  );
  const rows = candles.map((c) => [
    c.openTime,
    c.open,
    c.high,
    c.low,
    c.close,
    c.volume,
    c.closeTime,
  ]);
  writeFileSync(`${FIXTURE_DIRECTORY}/market/${SLICE_NAME}.json`, `${JSON.stringify(rows)}\n`);
  writeFileSync(
    `${FIXTURE_DIRECTORY}/market/${SLICE_NAME}.fear-greed.json`,
    `${JSON.stringify(fearGreed.map((day) => [day.observedAt, day.value]))}\n`,
  );
  const lines: string[] = [];
  for (const key of AUDITED_KEYS) {
    const series = buildRealAuditorSeries({ candles, market: pair.market, key, fearGreed });
    for (const windowCandles of WINDOWS) {
      const summary = summarizeAuditor(series, {
        decisionTime: last.openTime,
        timeframeMilliseconds: FIFTEEN_MINUTES,
        windowCandles,
      });
      lines.push(`  '${SLICE_NAME}:${key}:${windowCandles}':\n    '${goldenLine(summary)}',`);
    }
  }
  writeFileSync(
    `${FIXTURE_DIRECTORY}/auditor-golden-15m.fixture.ts`,
    `${GOLDEN_HEADER}export const AUDITOR_GOLDEN_15M: Readonly<Record<string, string>> = {\n${lines.join('\n')}\n};\n`,
  );
}
