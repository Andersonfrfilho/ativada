// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { RANGE_QUERY_SHAPE, requireRangeOrder } from '../run-range-query.js';
import { CHART_COLUMNS } from '../runs.constant.js';

const COLUMNS_PATTERN = /^\d{1,4}$/;

// Inteiro de 100 a 2.000 em texto de dígitos: `99`, `2001`, `1.5` e `abc` são 400, sem eco do valor.
const columnsSchema = z
  .string()
  .regex(COLUMNS_PATTERN)
  .transform(Number)
  .pipe(z.number().int().min(CHART_COLUMNS.MINIMUM).max(CHART_COLUMNS.MAXIMUM));

// A query estrita do gráfico: faixa `[from, to)` em ms UTC (ausente vale a borda da execução) e número de colunas.
export const chartQuerySchema = z
  .strictObject({ ...RANGE_QUERY_SHAPE, columns: columnsSchema.optional() })
  .superRefine(requireRangeOrder);

export type ChartQuery = z.infer<typeof chartQuerySchema>;
