// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EngineDecimal,
  type EngineDecimalValue,
  type ComputeProtectivePricesParams,
  type PositionSizeParams,
} from '../../../../packages/strategy-engine/src/index.js';
import { referenceProtectivePrices } from './reference-risk.fixture.js';

export type RiskCase = {
  readonly index: number;
  readonly protective: ComputeProtectivePricesParams;
  readonly sizing: PositionSizeParams;
  // Dados que o motor NÃO pode usar: os mutantes de entrada os trocam pelos legítimos.
  readonly decisionClose: string;
  readonly nextAtr: string;
  readonly fillCandleVolume: string;
};

export const RISK_GRID_SEED = 20_261_010;
export const RISK_GRID_SIZE = 6_000;
const UINT32_RANGE = 4_294_967_296;
const MULTIPLIER_STEP = 4;
const PRICE_EXPONENT_SPAN = 11;
const PRICE_EXPONENT_FLOOR = -5;
const RANDOM_STOP_SHARE_PERCENT = 30;
const ZERO_ATR_SHARE_PERCENT = 4;
const ZERO_VOLUME_SHARE_PERCENT = 3;
const TICK_MANTISSAS = [1, 2, 5] as const;

// mulberry32: PRNG inteiro de 32 bits, determinístico entre execuções e plataformas.
export function createRandom(seed: number): (limit: number) => number {
  let state = seed >>> 0;
  return (limit: number): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return Math.floor((((mixed ^ (mixed >>> 14)) >>> 0) / UINT32_RANGE) * limit);
  };
}

type Random = (limit: number) => number;

function text(mantissa: number, exponent: number): string {
  return new EngineDecimal(`${mantissa}e${exponent}`).toFixed();
}

function fixedText(value: EngineDecimalValue, places: number): string {
  return value.toDecimalPlaces(places, EngineDecimal.ROUND_HALF_UP).toFixed();
}

function priceExponentOf(random: Random): number {
  return PRICE_EXPONENT_FLOOR + random(PRICE_EXPONENT_SPAN);
}

function pickTick(random: Random, priceExponent: number): string {
  const exponent = Math.max(priceExponent - 1 - random(5), -8);
  return text(TICK_MANTISSAS[random(TICK_MANTISSAS.length)] ?? 1, exponent);
}

function pickStep(random: Random): string {
  return text(random(2) === 0 ? 1 : 5, -8 + random(9));
}

function pickAtr(random: Random, price: EngineDecimalValue): string {
  if (random(100) < ZERO_ATR_SHARE_PERCENT) return '0';
  return fixedText(price.times(random(1_001)).dividedBy(10_000), 12);
}

function pickVolume(random: Random): string {
  if (random(100) < ZERO_VOLUME_SHARE_PERCENT) return '0';
  return text(100 + random(900), -4 + random(17));
}

function buildProtective(random: Random): ComputeProtectivePricesParams {
  const priceExponent = priceExponentOf(random);
  const price = new EngineDecimal(text(100 + random(900), priceExponent - 2));
  return {
    entryPrice: price.toFixed(),
    atr: pickAtr(random, price),
    stopAtrMultiple: new EngineDecimal(1 + random(80)).dividedBy(MULTIPLIER_STEP).toFixed(),
    targetAtrMultiple: new EngineDecimal(1 + random(200)).dividedBy(MULTIPLIER_STEP).toFixed(),
    slippageRate: text(random(5_001), -6),
    tickSize: pickTick(random, priceExponent),
  };
}

function pickStop(random: Random, protective: ComputeProtectivePricesParams): string {
  const priced = referenceProtectivePrices(protective);
  if (priced.kind === 'priced' && random(100) >= RANDOM_STOP_SHARE_PERCENT) {
    return priced.stopPrice;
  }
  const entry = new EngineDecimal(protective.entryPrice);
  return fixedText(entry.times(random(1_201)).dividedBy(1_000), 12);
}

function buildSizing(
  random: Random,
  protective: ComputeProtectivePricesParams,
): PositionSizeParams {
  const cash = new EngineDecimal(text(10 + random(990), random(8) - 1));
  const equity = cash.times(50 + random(251)).dividedBy(100);
  const riskRate = new EngineDecimal(1 + random(3_000)).dividedBy(10_000);
  const riskAmount = random(100) < 3 ? '0' : fixedText(equity.times(riskRate), 8);
  return {
    riskAmount,
    entryPrice: protective.entryPrice,
    stopPrice: pickStop(random, protective),
    feeRate: text(random(5_001), -6),
    slippageRate: protective.slippageRate,
    cash: fixedText(cash, 8),
    equity: fixedText(equity, 8),
    maxExposureRate: new EngineDecimal(1 + random(100)).dividedBy(100).toFixed(),
    candleVolume: pickVolume(random),
    maxVolumeShare: new EngineDecimal(1 + random(1_000)).dividedBy(1_000).toFixed(),
    quantityStep: pickStep(random),
    tickSize: protective.tickSize,
    minNotional: ['0', '5', '10', '0.001'][random(4)] ?? '0',
  };
}

export function buildRiskGrid(size: number = RISK_GRID_SIZE): readonly RiskCase[] {
  const random = createRandom(RISK_GRID_SEED);
  return Array.from({ length: size }, (_unused, index) => {
    const protective = buildProtective(random);
    const entry = new EngineDecimal(protective.entryPrice);
    return {
      index,
      protective,
      sizing: buildSizing(random, protective),
      decisionClose: fixedText(entry.times(970 + random(61)).dividedBy(1_000), 12),
      nextAtr: fixedText(new EngineDecimal(protective.atr).times(2 + random(4)), 12),
      fillCandleVolume: pickVolume(random),
    };
  });
}
