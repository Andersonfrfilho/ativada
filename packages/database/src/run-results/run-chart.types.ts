// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { FillInput, TimeRange } from './run-result.types.js';

// O preço reduzido do gráfico (ADR 0002, spec 005, O7): `columns` baldes de tempo iguais sobre `[from, to)`.
export type PriceColumnsParams = {
  readonly exchange: string;
  readonly symbol: string;
  readonly timeframe: string;
  readonly range: TimeRange;
  readonly columns: number;
};

// Decimais em texto canônico (sem zeros à direita); `startTime` e `endTime` são a abertura da primeira e da última vela
// do balde, `first` a abertura da primeira e `last` o fechamento da última.
export type PriceColumn = {
  readonly startTime: number;
  readonly endTime: number;
  readonly first: string;
  readonly last: string;
  readonly low: string;
  readonly high: string;
};

export type FillMarkersParams = { readonly range: TimeRange; readonly limit: number };

// O preenchimento com o resultado da posição dele (só a venda carrega: a compra o deixa de fora).
export type FillMarkerInput = FillInput & { readonly netProfit: string | undefined };

export type FillCounts = { readonly buys: number; readonly sells: number };

export type FillClustersParams = { readonly range: TimeRange; readonly columns: number };

// Só os baldes que têm preenchimento; o índice é o mesmo balde de `PriceColumnsParams` aplicado a `candle_time`.
export type FillClusterBucket = {
  readonly bucket: number;
  readonly buys: number;
  readonly sells: number;
};
