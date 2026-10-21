// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';
import { SIGNAL_ACTION } from '@ativada/strategy-engine';

import { decimalTextSchema, epochMillisecondsSchema } from '../../openapi/schema-primitives.js';
import { RANGE_QUERY_SHAPE, requireRangeOrder } from '../run-range-query.js';
import { LAYER_LINE_ROLE, STRATEGY_LAYERS_VERSION } from './projections.constant.js';

// A query estrita das camadas: faixa `[from, to)` em ms UTC (ausente: as últimas 1.000 velas da execução).
export const strategyLayersQuerySchema = z
  .strictObject({ ...RANGE_QUERY_SHAPE })
  .superRefine(requireRangeOrder);

export type StrategyLayersQuery = z.infer<typeof strategyLayersQuerySchema>;

const LINE_SCHEMA = z.strictObject({
  key: z.string(),
  ruleId: z.string(),
  role: z.enum(Object.values(LAYER_LINE_ROLE)),
  label: z.string(),
  values: z.array(decimalTextSchema.nullable()),
});

const THRESHOLD_SCHEMA = z.strictObject({
  from: epochMillisecondsSchema,
  to: epochMillisecondsSchema,
  buy: decimalTextSchema,
  sell: decimalTextSchema,
});

// Em colunas: o payload de 1.000 velas com as 7 linhas possíveis fica perto de 140 KB (ADR 0002, spec 009, P1).
export const STRATEGY_LAYERS_SCHEMA = z.strictObject({
  version: z.literal(STRATEGY_LAYERS_VERSION),
  timeframe: z.string(),
  from: epochMillisecondsSchema,
  to: epochMillisecondsSchema,
  candleTimes: z.array(epochMillisecondsSchema),
  score: z.array(decimalTextSchema),
  actions: z.array(z.enum(SIGNAL_ACTION)),
  atr: z.array(decimalTextSchema.nullable()),
  lines: z.array(LINE_SCHEMA),
  thresholds: z.array(THRESHOLD_SCHEMA),
  // Presente (`team_run`) quando a simulação segue uma equipe de modelo: não há regras a desenhar (spec 015).
  unavailable: z.literal('team_run').optional(),
});

export type StrategyLayersView = z.infer<typeof STRATEGY_LAYERS_SCHEMA>;
