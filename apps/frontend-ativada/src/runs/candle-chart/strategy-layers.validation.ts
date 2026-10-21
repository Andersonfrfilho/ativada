// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { decimalText } from '../../http/decimal.validation.js';

// Espelho de `GET /v1/runs/:runId/strategy-layers` (ADR 0002, spec 009, P1 e P2): em colunas, uma posição por vela.
// Valor fora do contrato reprova e o gráfico não desenha camada nenhuma.
export const LAYERS_VERSION = 'layers-1';

export const LAYER_LINE_ROLE = [
  'channel_upper',
  'channel_lower',
  'ema_fast',
  'ema_slow',
  'band_upper',
  'band_middle',
  'band_lower',
] as const;

const lineSchema = z.object({
  key: z.string(),
  ruleId: z.string(),
  role: z.enum(LAYER_LINE_ROLE),
  label: z.string(),
  values: z.array(decimalText.nullable()),
});

const thresholdSchema = z.object({
  from: z.number(),
  to: z.number(),
  buy: decimalText,
  sell: decimalText,
});

export const strategyLayersSchema = z
  .object({
    version: z.literal(LAYERS_VERSION),
    timeframe: z.string(),
    from: z.number(),
    to: z.number(),
    candleTimes: z.array(z.number()),
    score: z.array(decimalText),
    actions: z.array(z.enum(['BUY', 'SELL', 'HOLD'])),
    atr: z.array(decimalText.nullable()),
    lines: z.array(lineSchema),
    thresholds: z.array(thresholdSchema),
  })
  .refine((layers) => {
    const length = layers.candleTimes.length;
    const lineColumns = layers.lines.map((line) => line.values);
    const columns = [layers.score, layers.actions, layers.atr, ...lineColumns];
    return columns.every((column) => column.length === length);
  });

export type StrategyLayers = z.infer<typeof strategyLayersSchema>;
export type StrategyLayerLine = StrategyLayers['lines'][number];
export type LayerThreshold = StrategyLayers['thresholds'][number];
