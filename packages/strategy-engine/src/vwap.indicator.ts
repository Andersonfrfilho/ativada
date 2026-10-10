// Copyright (c) 2026 Ada Technology. All rights reserved.
import { defineIndicator } from './define-indicator.js';
import { INDICATOR_NAME } from './indicator-name.constant.js';
import type { NoParams } from './indicator-params.types.js';
import { readNullableNumber, readNumberArray, readRecord } from './indicator-snapshot.js';
import { sumOf } from './indicator-statistics.js';

const MILLISECONDS_PER_DAY = 86_400_000;
const TYPICAL_PRICE_DIVISOR = 3;
const MAXIMUM_SESSION_CANDLES = 100_000;

// Sessão = dia UTC. Guarda, por candle da sessão, preço típico × volume e o volume.
type VwapState = {
  readonly day: number | null;
  readonly traded: readonly number[];
  readonly volumes: readonly number[];
};

// Sessão que reinicia à meia-noite UTC; preço típico (máx + mín + fechamento)/3. Recalculada sobre
// os candles da sessão (nada de acumulado corrido). Sem volume na sessão, vale o preço típico do candle.
export const VWAP_INDICATOR = defineIndicator<NoParams, VwapState, number>({
  name: INDICATOR_NAME.VWAP,
  horizon: () => ({ warmupCandles: 1, convergenceCandles: 1 }),
  initialState: () => ({ day: null, traded: [], volumes: [] }),
  parseState: ({ snapshot }) => {
    const record = readRecord(snapshot);
    const maximumLength = MAXIMUM_SESSION_CANDLES;
    return {
      day: readNullableNumber(record, 'day'),
      traded: readNumberArray({ record, key: 'traded', maximumLength }),
      volumes: readNumberArray({ record, key: 'volumes', maximumLength }),
    };
  },
  advance: ({ state, candle }) => {
    const day = Math.floor(candle.openTime / MILLISECONDS_PER_DAY);
    const typicalPrice = (candle.high + candle.low + candle.close) / TYPICAL_PRICE_DIVISOR;
    const isSameSession = state.day === day;
    const traded = [...(isSameSession ? state.traded : []), typicalPrice * candle.volume];
    const volumes = [...(isSameSession ? state.volumes : []), candle.volume];
    const totalVolume = sumOf(volumes);
    return {
      state: { day, traded, volumes },
      value: totalVolume === 0 ? typicalPrice : sumOf(traded) / totalVolume,
    };
  },
});
