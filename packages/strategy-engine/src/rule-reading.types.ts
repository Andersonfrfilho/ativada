// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { IndicatorValue } from './indicator.types.js';

// `previous`: o valor do candle anterior; só o rompimento de Donchian o lê (o valor corrente já
// inclui o candle atual).
export type RuleReading = {
  readonly current: IndicatorValue | undefined;
  readonly previous: IndicatorValue | undefined;
};

// Tudo o que o placar lê dos indicadores num fechamento, por id de regra; `undefined` só antes do
// aquecimento (o passo nem chama o placar) e, depois dele, é erro tipado.
export type ScoreboardReadings = {
  readonly rules: Readonly<Record<string, RuleReading>>;
  readonly atr: IndicatorValue | undefined;
  readonly adx: IndicatorValue | undefined;
};
