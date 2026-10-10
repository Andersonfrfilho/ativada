// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonValue } from '@cryptoada/database';
import { z } from '@cryptoada/environment';

import { DECIMAL_TEXT_PATTERN } from './alert-payload.schema.js';
import type { HistoricalHitRate } from './live-run.types.js';

// `runs.metrics` de um walk-forward concluído (fora da amostra concatenado): a taxa de acerto é uma métrica que pode não se
// definir (`value: null`, com o motivo), e o resto do relatório não interessa aqui.
const walkForwardMetricsSchema = z.looseObject({
  winRate: z.strictObject({
    value: z.string().regex(DECIMAL_TEXT_PATTERN).nullable(),
    reason: z.string().nullable(),
  }),
  trades: z.number().int().nonnegative(),
});

export function parseHitRate(metrics: JsonValue | undefined): HistoricalHitRate | undefined {
  const parsed = walkForwardMetricsSchema.safeParse(metrics);
  if (!parsed.success || parsed.data.winRate.value === null) return undefined;
  return { winRate: parsed.data.winRate.value, trades: parsed.data.trades };
}
