// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle } from './engine-candle.types.js';
import { ENGINE_TIMEFRAME_DURATION_MILLISECONDS } from './engine.constant.js';
import { toEngineDecimal } from './engine-decimal.js';
import type { EngineMarket } from './strategy-config.types.js';
import {
  ENGINE_INPUT_ERROR_CODE,
  EngineInputError,
  type EngineInputErrorCode,
} from './strategy-engine.error.js';

// Texto decimal sem sinal nem expoente: nada de `DecimalError` cru escapando do passo.
const UNSIGNED_DECIMAL_PATTERN = /^\d{1,20}(\.\d{1,20})?$/;

export type AssertCandleSequenceParams = {
  readonly candle: EngineCandle;
  readonly lastCandleOpenTime: number | null;
  readonly market: EngineMarket;
  readonly confirmedGapCandles?: number | undefined;
};

export function refuse(code: EngineInputErrorCode, message: string): never {
  throw new EngineInputError({ code, message });
}

function isTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function hasSanePrices(candle: EngineCandle): boolean {
  const texts = [candle.open, candle.high, candle.low, candle.close, candle.volume];
  if (!texts.every((text) => UNSIGNED_DECIMAL_PATTERN.test(text))) return false;
  const [open, high, low, close] = texts.map((text) => toEngineDecimal(text));
  if (open === undefined || high === undefined || low === undefined || close === undefined) {
    return false;
  }
  const isPositive = [open, high, low, close].every((price) => price.greaterThan(0));
  const bodyLow = open.lessThan(close) ? open : close;
  const bodyHigh = open.lessThan(close) ? close : open;
  return isPositive && low.lte(bodyLow) && bodyHigh.lte(high);
}

// Preços positivos, mínima ≤ corpo ≤ máxima, volume ≥ 0, tempos inteiros, par e grade do timeframe.
export function assertCandleShape(candle: EngineCandle, market: EngineMarket): void {
  if (candle.symbol !== market.symbol || candle.timeframe !== market.timeframe) {
    refuse(ENGINE_INPUT_ERROR_CODE.CANDLE_WRONG_MARKET, 'Candle de outro par ou timeframe.');
  }
  if (!isTime(candle.openTime) || !isTime(candle.closeTime) || !hasSanePrices(candle)) {
    refuse(ENGINE_INPUT_ERROR_CODE.CANDLE_INSANE, 'Candle com preço, volume ou tempo inválido.');
  }
  const duration = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[market.timeframe];
  if (candle.openTime % duration !== 0 || candle.closeTime !== candle.openTime + duration - 1) {
    refuse(ENGINE_INPUT_ERROR_CODE.CANDLE_OFF_GRID, 'Candle fora da grade do timeframe.');
  }
}

export function assertCandleAfter(candle: EngineCandle, lastCandleOpenTime: number | null): void {
  if (lastCandleOpenTime === null || candle.openTime > lastCandleOpenTime) return;
  if (candle.openTime === lastCandleOpenTime) {
    refuse(ENGINE_INPUT_ERROR_CODE.CANDLE_ALREADY_PROCESSED, 'Candle já processado.');
  }
  refuse(ENGINE_INPUT_ERROR_CODE.CANDLE_OUT_OF_ORDER, 'Candle anterior ao último processado.');
}

// Lacuna para a frente só com a contagem exata declarada pelo chamador (lacuna confirmada).
export function assertCandleSequence(params: AssertCandleSequenceParams): void {
  const { candle, lastCandleOpenTime } = params;
  assertCandleAfter(candle, lastCandleOpenTime);
  const declared = params.confirmedGapCandles ?? 0;
  if (!Number.isSafeInteger(declared) || declared < 0) {
    refuse(ENGINE_INPUT_ERROR_CODE.CANDLE_GAP_UNCONFIRMED, 'Lacuna declarada inválida.');
  }
  if (lastCandleOpenTime === null) return;
  const duration = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[params.market.timeframe];
  const missing = (candle.openTime - lastCandleOpenTime) / duration - 1;
  if (missing !== declared) {
    refuse(
      ENGINE_INPUT_ERROR_CODE.CANDLE_GAP_UNCONFIRMED,
      `Lacuna de ${missing} candle(s) sem confirmação exata (declarada: ${declared}).`,
    );
  }
}
