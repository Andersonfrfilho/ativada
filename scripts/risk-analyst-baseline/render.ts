// Copyright (c) 2026 Ada Technology. All rights reserved.
import { judgeAgainstCoinFlip } from '../../packages/statistics/src/index.js';
import type { AuditorSummary } from '../../test/fixtures/risk-analyst/auditor-oracle.fixture.js';

const VERDICT_LABEL = {
  above: 'prova valor (acima da moeda)',
  even: 'igual à moeda',
  below: 'abaixo da moeda',
  too_few: 'poucas (< 30)',
} as const;

const WILSON_SCALE = 12;
const PERCENT_PLACES = 2;

// Texto decimal de 12 casas → porcentagem com 2 casas, arredondada para fora (limite de baixo desce, o de cima sobe).
function percentOutward(text: string, direction: 'down' | 'up'): string {
  const [integer = '0', fraction = ''] = text.split('.');
  const scaled =
    BigInt(integer) * 10n ** BigInt(WILSON_SCALE) + BigInt(fraction.padEnd(WILSON_SCALE, '0'));
  const divisor = 10n ** BigInt(WILSON_SCALE - 2 - PERCENT_PLACES);
  const steps = direction === 'down' ? scaled / divisor : (scaled + divisor - 1n) / divisor;
  const digits = steps.toString().padStart(PERCENT_PLACES + 1, '0');
  return `${digits.slice(0, -PERCENT_PLACES)},${digits.slice(-PERCENT_PLACES)}`;
}

function percentOf(rate: string | null): string {
  if (rate === null) return '—';
  const [integer = '0', fraction = ''] = rate.split('.');
  const steps = BigInt(integer) * 10_000n + BigInt(fraction.padEnd(4, '0'));
  const digits = steps.toString().padStart(3, '0');
  return `${digits.slice(0, -2)},${digits.slice(-2)}%`;
}

export function assertAgainstSharedWilson(summary: AuditorSummary): void {
  const shared = judgeAgainstCoinFlip({ hits: summary.hits, counted: summary.counted });
  if (shared.verdict !== summary.verdict) {
    throw new Error(`veredito divergente do Wilson único: ${shared.verdict} × ${summary.verdict}`);
  }
}

export type ReportRow = {
  readonly pair: string;
  readonly timeframe: string;
  readonly item: string;
  readonly summary: AuditorSummary;
};

export function renderTable(rows: readonly ReportRow[]): string {
  const lines = [
    '| Par | Vela | Item | Previsões | Contadas (M) | Acertos (N) | Acerto | "Sempre sobe" | Wilson 95% | Veredito | Peso |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const { pair, timeframe, item, summary } of rows) {
    const wilson =
      summary.lower === null || summary.upper === null
        ? '—'
        : `${percentOutward(summary.lower, 'down')}% a ${percentOutward(summary.upper, 'up')}%`;
    lines.push(
      `| ${pair} | ${timeframe} | ${item} | ${summary.predictions} | ${summary.counted} | ${summary.hits} | ` +
        `${percentOf(summary.hitRate)} | ${percentOf(summary.upRate)} | ${wilson} | ${VERDICT_LABEL[summary.verdict]} | ${summary.weight} |`,
    );
  }
  return lines.join('\n');
}
