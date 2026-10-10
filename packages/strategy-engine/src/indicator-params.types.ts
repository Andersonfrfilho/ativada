// Copyright (c) 2026 Ada Technology. All rights reserved.

export type PeriodParams = { readonly period: number };

export type MacdParams = {
  readonly fastPeriod: number;
  readonly slowPeriod: number;
  readonly signalPeriod: number;
};

export type BollingerParams = {
  readonly period: number;
  readonly deviations: number;
};

export type EmaCrossParams = {
  readonly fastPeriod: number;
  readonly slowPeriod: number;
};

export type ObvTrendParams = { readonly emaPeriod: number };

// Sem parâmetro (VWAP, OBV): objeto vazio, para `create({})` seguir o mesmo formato dos demais.
export type NoParams = Readonly<Record<string, never>>;
