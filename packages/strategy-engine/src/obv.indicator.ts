// Copyright (c) 2026 Ada Technology. All rights reserved.
import { defineIndicator } from './define-indicator.js';
import { INDICATOR_NAME } from './indicator-name.constant.js';
import type { NoParams } from './indicator-params.types.js';
import {
  PREVIOUS_CLOSE_KEY,
  readNullableNumber,
  readNumber,
  readRecord,
} from './indicator-snapshot.js';
import type { JsonValue } from './json-value.types.js';

export type ObvState = {
  readonly previousClose: number | null;
  readonly level: number;
};

export const INITIAL_OBV_STATE: ObvState = { previousClose: null, level: 0 };

export type AdvanceObvParams = {
  readonly state: ObvState;
  readonly close: number;
  readonly volume: number;
};

// +volume se o fechamento sobe, −volume se cai, 0 se igual; o primeiro candle vale 0 (sem anterior).
export function advanceObv(params: AdvanceObvParams): ObvState {
  const { state, close, volume } = params;
  if (state.previousClose === null || close === state.previousClose) {
    return { previousClose: close, level: state.level };
  }
  const signedVolume = close > state.previousClose ? volume : -volume;
  return { previousClose: close, level: state.level + signedVolume };
}

export function parseObvState(snapshot: JsonValue | undefined): ObvState {
  const record = readRecord(snapshot);
  return {
    previousClose: readNullableNumber(record, PREVIOUS_CLOSE_KEY),
    level: readNumber(record, 'level'),
  };
}

// O NÍVEL depende do candle em que a série começa; só a diferença e médias dele têm significado.
export const OBV_INDICATOR = defineIndicator<NoParams, ObvState, number>({
  name: INDICATOR_NAME.OBV,
  horizon: () => ({ warmupCandles: 1, convergenceCandles: 1 }),
  initialState: () => INITIAL_OBV_STATE,
  parseState: ({ snapshot }) => parseObvState(snapshot),
  advance: ({ state, candle }) => {
    const next = advanceObv({ state, close: candle.close, volume: candle.volume });
    return { state: next, value: next.level };
  },
});
