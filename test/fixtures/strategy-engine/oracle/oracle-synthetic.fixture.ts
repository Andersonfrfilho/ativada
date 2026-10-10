// Copyright (c) 2026 Ada Technology. All rights reserved.
import { buildMarketSeries, type MarketSeries } from './oracle-market.fixture.js';
import { toOracleNumber, type OracleCandle } from './oracle-decimal.fixture.js';

const HOUR_MILLISECONDS = 3_600_000;
// 20h UTC: a série cruza a meia-noite no 5º candle, então a VWAP reinicia várias vezes.
const FIRST_OPEN_TIME = Date.UTC(2025, 0, 1, 20);
const PARK_MILLER_MULTIPLIER = 48_271;
const PARK_MILLER_MODULUS = 2_147_483_647;
const CENTS = 100;

type CandleSpecInCents = {
  readonly open: number;
  readonly close: number;
  readonly wickUp: number;
  readonly wickDown: number;
  readonly volume: number;
};

function formatCents(cents: number): string {
  return (cents / CENTS).toFixed(2);
}

function toCandle(spec: CandleSpecInCents, index: number): OracleCandle {
  const high = Math.max(spec.open, spec.close) + spec.wickUp;
  const low = Math.min(spec.open, spec.close) - spec.wickDown;
  return {
    openTime: FIRST_OPEN_TIME + index * HOUR_MILLISECONDS,
    open: toOracleNumber(formatCents(spec.open)),
    high: toOracleNumber(formatCents(high)),
    low: toOracleNumber(formatCents(low)),
    close: toOracleNumber(formatCents(spec.close)),
    volume: toOracleNumber(spec.volume),
  };
}

// Gerador determinístico (Park–Miller) com inteiros: a mesma série em qualquer máquina.
function createRandomSource(seed: number): () => number {
  let state = seed;
  return (): number => {
    state = (state * PARK_MILLER_MULTIPLIER) % PARK_MILLER_MODULUS;
    return state;
  };
}

function randomWalk(params: {
  readonly start: number;
  readonly length: number;
}): CandleSpecInCents[] {
  const next = createRandomSource(20_250_101);
  const specs: CandleSpecInCents[] = [];
  let open = params.start;
  for (let step = 0; step < params.length; step += 1) {
    const close = open + (next() % 401) - 200;
    specs.push({
      open,
      close,
      wickUp: next() % 100,
      wickDown: next() % 100,
      volume: 100 + (next() % 900),
    });
    open = close;
  }
  return specs;
}

function plateau(params: { readonly price: number; readonly length: number }): CandleSpecInCents[] {
  const spec = { open: params.price, close: params.price, wickUp: 0, wickDown: 0, volume: 50 };
  return Array.from({ length: params.length }, () => spec);
}

function monotone(params: {
  readonly start: number;
  readonly stepCents: number;
  readonly length: number;
}): CandleSpecInCents[] {
  return Array.from({ length: params.length }, (_unused, step) => {
    const open = params.start + step * params.stepCents;
    return { open, close: open + params.stepCents, wickUp: 0, wickDown: 0, volume: 200 + step };
  });
}

function withZeroVolume(specs: readonly CandleSpecInCents[]): CandleSpecInCents[] {
  return specs.map((spec) => ({ ...spec, volume: 0 }));
}

const WALK_START = 10_000;
const PLATEAU_LENGTH = 15;
const RISE_STEP = 50;

// Bordas: caminhada, platô, gap de +15% sobre o platô, volume zero, subida e queda monótonas.
function buildEdgeSpecs(): CandleSpecInCents[] {
  const walk = randomWalk({ start: WALK_START, length: 40 });
  const walkEnd = walk[walk.length - 1]?.close ?? WALK_START;
  const flat = plateau({ price: walkEnd, length: PLATEAU_LENGTH });
  const gapOpen = Math.round(walkEnd * 1.15);
  const afterGap = randomWalk({ start: gapOpen, length: 25 });
  const silent = withZeroVolume(
    randomWalk({ start: afterGap[afterGap.length - 1]?.close ?? gapOpen, length: 6 }),
  );
  const riseStart = silent[silent.length - 1]?.close ?? gapOpen;
  const rise = monotone({ start: riseStart, stepCents: RISE_STEP, length: 35 });
  const fall = monotone({ start: riseStart + 35 * RISE_STEP, stepCents: -RISE_STEP, length: 35 });
  return [...walk, ...flat, ...afterGap, ...silent, ...rise, ...fall];
}

export const SYNTHETIC_EDGE_SERIES: MarketSeries = buildMarketSeries(
  'sintética com bordas',
  buildEdgeSpecs().map(toCandle),
);

const STANDALONE_LENGTH = 60;

function standalone(name: string, specs: readonly CandleSpecInCents[]): MarketSeries {
  return buildMarketSeries(name, specs.map(toCandle));
}

// Séries curtas e puras para as bordas: sem passado que adoce o resultado (a média de Wilder lembra
// perdas antigas para sempre; RSI 100 exato só existe se nunca houve perda).
export const MONOTONE_RISE_SERIES: MarketSeries = standalone(
  'subida monótona',
  monotone({ start: WALK_START, stepCents: RISE_STEP, length: STANDALONE_LENGTH }),
);
export const MONOTONE_FALL_SERIES: MarketSeries = standalone(
  'queda monótona',
  monotone({ start: 2 * WALK_START, stepCents: -RISE_STEP, length: STANDALONE_LENGTH }),
);
export const PLATEAU_SERIES: MarketSeries = standalone(
  'platô',
  plateau({ price: WALK_START, length: STANDALONE_LENGTH }),
);
export const ZERO_VOLUME_SERIES: MarketSeries = standalone(
  'volume zero',
  withZeroVolume(randomWalk({ start: WALK_START, length: STANDALONE_LENGTH })),
);

export const EDGE_SERIES: readonly MarketSeries[] = [
  SYNTHETIC_EDGE_SERIES,
  MONOTONE_RISE_SERIES,
  MONOTONE_FALL_SERIES,
  PLATEAU_SERIES,
  ZERO_VOLUME_SERIES,
];
