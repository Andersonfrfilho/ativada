// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { JsonValue } from './json-value.types.js';

// Única entrada float do motor: o indicador calcula em `number`, nunca toca em dinheiro. `open` e
// `openTime` servem à VWAP (preço típico e sessão).
export type IndicatorCandle = {
  readonly openTime: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume: number;
};

export type IndicatorValue = number | Readonly<Record<string, number>>;

// Incremental: `update` devolve `undefined` exatamente nas `warmupCandles - 1` primeiras chamadas e um
// valor finito a partir da `warmupCandles`-ésima. Valor devolvido nunca muda depois (sem repintura).
// `convergenceCandles`: candles até o peso do primeiro cair abaixo de ε = 1e-3 (memória infinita);
// janela finita declara o próprio `warmupCandles`.
export type Indicator<TValue extends IndicatorValue> = {
  readonly warmupCandles: number;
  readonly convergenceCandles: number;
  readonly update: (candle: IndicatorCandle) => TValue | undefined;
  readonly snapshot: () => JsonValue;
};

export type RestoreIndicatorParams<TParams> = {
  readonly params: TParams;
  readonly snapshot: JsonValue;
};

// `restore(snapshot())` seguido de N updates dá os mesmos valores que N updates no original.
export type IndicatorDefinition<TParams, TValue extends IndicatorValue> = {
  readonly name: string;
  readonly create: (params: TParams) => Indicator<TValue>;
  readonly restore: (params: RestoreIndicatorParams<TParams>) => Indicator<TValue>;
};

export type IndicatorHorizon = {
  readonly warmupCandles: number;
  readonly convergenceCandles: number;
};
