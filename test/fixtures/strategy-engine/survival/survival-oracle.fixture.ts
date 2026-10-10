// Copyright (c) 2026 Ada Technology. All rights reserved.

// Oráculo INDEPENDENTE (bigint em escala fixa, sem `decimal.js` nem o código do pacote) da sobrevivência do saldo.
const MONEY_SCALE = 100_000_000n;
const RATE_SCALE = 10_000n;
const PROGRESS_SCALE = 10_000n;
const NINES = 9_999n;

export type OraclePoint = {
  readonly candleOpenTime: number;
  readonly equity: bigint;
  readonly equityAtLow: bigint;
};

export type OracleInput = {
  readonly initial: bigint;
  readonly floorRate: bigint;
  readonly doubleRate: bigint;
  readonly startTime: number;
  readonly durationMilliseconds: number;
  readonly points: readonly OraclePoint[];
};

export type OracleMilestone = {
  readonly level: bigint;
  readonly reachedAt: number | null;
  readonly elapsed: number | null;
  readonly progress: bigint;
};

export type OracleResult = {
  readonly floor: OracleMilestone;
  readonly double: OracleMilestone;
  readonly lowest: bigint | null;
  readonly highest: bigint | null;
};

function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  return numerator % denominator === 0n ? quotient : quotient + 1n;
}

export function formatScaled(value: bigint): string {
  const whole = value / MONEY_SCALE;
  const fraction = (value % MONEY_SCALE).toString().padStart(8, '0').replace(/0+$/, '');
  return fraction.length === 0 ? whole.toString() : `${whole}.${fraction}`;
}

export function parseScaled(text: string): bigint {
  const [whole = '0', fraction = ''] = text.split('.');
  return BigInt(whole) * MONEY_SCALE + BigInt(fraction.padEnd(8, '0'));
}

export function formatProgress(value: bigint): string {
  const whole = value / PROGRESS_SCALE;
  const fraction = (value % PROGRESS_SCALE).toString().padStart(4, '0').replace(/0+$/, '');
  return fraction.length === 0 ? whole.toString() : `${whole}.${fraction}`;
}

export function runOracle(input: OracleInput): OracleResult {
  const floorLevel = ceilDivide(input.initial * input.floorRate, RATE_SCALE);
  const doubleLevel = ceilDivide(input.initial * input.doubleRate, RATE_SCALE);
  const counted = input.points.filter((point) => point.candleOpenTime >= input.startTime);
  const closeOf = (point: OraclePoint): number =>
    point.candleOpenTime + input.durationMilliseconds - input.startTime;
  const floorHit = counted.find((point) => point.equityAtLow <= floorLevel);
  const doubleHit = counted.find((point) => point.equity >= doubleLevel);
  const lowest =
    counted.length === 0
      ? null
      : counted.map((point) => point.equityAtLow).reduce((a, b) => (b < a ? b : a));
  const highest =
    counted.length === 0
      ? null
      : counted.map((point) => point.equity).reduce((a, b) => (b > a ? b : a));
  const consumed =
    lowest === null || lowest >= input.initial || floorLevel >= input.initial
      ? 0n
      : ceilDivide((input.initial - lowest) * PROGRESS_SCALE, input.initial - floorLevel);
  const gained =
    highest === null || highest <= input.initial
      ? 0n
      : ((highest - input.initial) * PROGRESS_SCALE) / (doubleLevel - input.initial);
  return {
    floor: {
      level: floorLevel,
      reachedAt: floorHit?.candleOpenTime ?? null,
      elapsed: floorHit === undefined ? null : closeOf(floorHit),
      progress: floorHit === undefined ? (consumed > NINES ? NINES : consumed) : PROGRESS_SCALE,
    },
    double: {
      level: doubleLevel,
      reachedAt: doubleHit?.candleOpenTime ?? null,
      elapsed: doubleHit === undefined ? null : closeOf(doubleHit),
      progress: doubleHit === undefined ? (gained > NINES ? NINES : gained) : PROGRESS_SCALE,
    },
    lowest,
    highest,
  };
}
