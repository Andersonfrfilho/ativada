// Copyright (c) 2026 Ada Technology. All rights reserved.

// Oráculo do auditor de acertos das equipes (spec 015, RF16), independente do `src` do pacote: só `bigint`. Recebe as
// recomendações gravadas (com o fechamento de `t` e o de `t + 15 min`) e conta como o `opinion-auditor.ts` deve contar.

const SCALE_PLACES = 20;
const MINIMUM_COUNTED = 30;
// z = 1,96 → z² = 3,8416 = 2401/625.
const Z_NUMERATOR = 2401n;
const Z_DENOMINATOR = 625n;

export type OracleReading = {
  readonly kind: 'scheduled' | 'on_demand';
  readonly status: 'pending' | 'decided' | 'failed' | 'skipped';
  readonly action: 'buy' | 'sell' | 'hold' | null;
  readonly confidence: number | null;
  readonly candleTime: number;
  readonly close: string;
  readonly nextClose: string | undefined;
};

export type OracleSummary = {
  readonly counted: number;
  readonly hits: number;
  readonly misses: number;
  readonly ties: number;
  readonly gaps: number;
  readonly hitRate: string | null;
  readonly verdict: 'above' | 'even' | 'below' | 'too_few';
  readonly averageConfidenceOnHit: string | null;
  readonly averageConfidenceOnMiss: string | null;
};

// Texto decimal → inteiro em escala 10⁻²⁰ (as entradas dos testes têm poucas casas).
function scaled(text: string): bigint {
  const [whole = '0', fraction = ''] = text.split('.');
  const padded = fraction.padEnd(SCALE_PLACES, '0').slice(0, SCALE_PLACES);
  return BigInt(whole) * 10n ** BigInt(SCALE_PLACES) + BigInt(padded);
}

// `numerador ÷ denominador` truncado a `places` casas, escrito como o motor escreve (sem zeros à direita).
function floorDecimal(numerator: bigint, denominator: bigint, places: number): string {
  const unit = 10n ** BigInt(places);
  const value = (numerator * unit) / denominator;
  const whole = value / unit;
  const fraction = (value % unit).toString().padStart(places, '0').replace(/0+$/, '');
  return fraction === '' ? whole.toString() : `${whole}.${fraction}`;
}

// Limite de baixo > 1/2 ⇔ 2h > n e n(2h − n)² > z²(4h(n − h) + z²n); o de cima < 1/2 ⇔ 2h < n e a mesma desigualdade.
function verdictOf(hits: bigint, counted: bigint): OracleSummary['verdict'] {
  if (counted < BigInt(MINIMUM_COUNTED)) return 'too_few';
  const left = Z_DENOMINATOR * Z_DENOMINATOR * counted * (2n * hits - counted) ** 2n;
  const right =
    Z_NUMERATOR * (Z_DENOMINATOR * 4n * hits * (counted - hits) + Z_NUMERATOR * counted);
  if (left <= right) return 'even';
  return 2n * hits > counted ? 'above' : 'below';
}

function isCountable(reading: OracleReading, windowStart: number): boolean {
  const hasSide = reading.action === 'buy' || reading.action === 'sell';
  return (
    reading.kind === 'scheduled' &&
    reading.status === 'decided' &&
    hasSide &&
    reading.candleTime >= windowStart
  );
}

export function summarizeOracle(
  readings: readonly OracleReading[],
  windowStart: number,
): OracleSummary {
  let hits = 0n;
  let misses = 0n;
  let ties = 0;
  let gaps = 0;
  let hitConfidence = 0n;
  let missConfidence = 0n;
  for (const reading of readings) {
    if (!isCountable(reading, windowStart)) continue;
    if (reading.nextClose === undefined) {
      gaps += 1;
      continue;
    }
    const closeScaled = scaled(reading.close);
    const nextScaled = scaled(reading.nextClose);
    if (nextScaled === closeScaled) {
      ties += 1;
      continue;
    }
    const isUp = nextScaled > closeScaled;
    const isHit = isUp === (reading.action === 'buy');
    const confidence = BigInt(reading.confidence ?? 0);
    if (isHit) {
      hits += 1n;
      hitConfidence += confidence;
    } else {
      misses += 1n;
      missConfidence += confidence;
    }
  }
  const counted = hits + misses;
  return {
    counted: Number(counted),
    hits: Number(hits),
    misses: Number(misses),
    ties,
    gaps,
    hitRate: counted === 0n ? null : floorDecimal(hits, counted, 4),
    verdict: verdictOf(hits, counted),
    averageConfidenceOnHit: hits === 0n ? null : floorDecimal(hitConfidence, hits, 2),
    averageConfidenceOnMiss: misses === 0n ? null : floorDecimal(missConfidence, misses, 2),
  };
}

export function verdictForCounts(hits: number, counted: number): OracleSummary['verdict'] {
  return verdictOf(BigInt(hits), BigInt(counted));
}
