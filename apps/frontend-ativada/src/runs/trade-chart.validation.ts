// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { decimalText } from '../http/decimal.validation.js';

const priceColumnSchema = z.object({
  startTime: z.number(),
  endTime: z.number(),
  first: decimalText,
  last: decimalText,
  low: decimalText,
  high: decimalText,
});

export const chartMarkerSchema = z.object({
  positionKey: z.string(),
  side: z.enum(['buy', 'sell']),
  candleTime: z.number(),
  price: decimalText,
  quantity: decimalText,
  fee: decimalText,
  amount: decimalText,
  netProfit: decimalText.optional(),
  netProfitRate: decimalText.optional(),
});

export const chartClusterSchema = z.object({
  startTime: z.number(),
  endTime: z.number(),
  buys: z.number(),
  sells: z.number(),
});

// Acima do limite de marcadores a API manda os agrupamentos no lugar (um dos dois vem nulo).
export const tradeChartSchema = z.object({
  symbol: z.string(),
  timeframe: z.string(),
  from: z.number(),
  to: z.number(),
  runRange: z.object({ from: z.number(), to: z.number() }),
  lastClosedCandleTime: z.number().nullable(),
  columns: z.array(priceColumnSchema),
  markers: z.array(chartMarkerSchema).nullable(),
  clusters: z.array(chartClusterSchema).nullable(),
  totals: z.object({ buys: z.number(), sells: z.number() }),
});

export type PriceColumn = z.infer<typeof priceColumnSchema>;
export type ChartMarker = z.infer<typeof chartMarkerSchema>;
export type ChartCluster = z.infer<typeof chartClusterSchema>;
export type TradeChart = z.infer<typeof tradeChartSchema>;
