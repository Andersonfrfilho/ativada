// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EngineDecimal,
  formatEngineDecimal,
  type EngineDecimalValue,
} from '@ativada/strategy-engine';

// z = 1,96 (95%) → z² = 3,8416 = 2401/625: a decisão do veredito é uma desigualdade inteira, sem raiz nem arredondamento.
export const WILSON_Z_SQUARED = { numerator: 2401n, denominator: 625n } as const;
export const WILSON_DECIMAL_PLACES = 12;
export const COIN_FLIP_MINIMUM_COUNTED = 30;

const Z = new EngineDecimal('1.96');
const Z_SQUARED = new EngineDecimal('3.8416');
const HALF = new EngineDecimal('0.5');
const QUARTER = new EngineDecimal('0.25');

export const COIN_FLIP_VERDICT = {
  ABOVE: 'above',
  EVEN: 'even',
  BELOW: 'below',
  TOO_FEW: 'too_few',
} as const;
export type CoinFlipVerdict = (typeof COIN_FLIP_VERDICT)[keyof typeof COIN_FLIP_VERDICT];

export type WilsonInterval = { readonly lower: string; readonly upper: string };
export type ComputeWilsonIntervalParams = { readonly successes: number; readonly total: number };
export type JudgeAgainstCoinFlipParams = { readonly hits: number; readonly counted: number };
export type CoinFlipJudgement = {
  readonly verdict: CoinFlipVerdict;
  // Ausentes (`null`) quando não há nenhuma previsão contada.
  readonly lower: string | null;
  readonly upper: string | null;
};

function assertCounts(params: ComputeWilsonIntervalParams): void {
  const { successes, total } = params;
  const isValid =
    Number.isInteger(successes) && Number.isInteger(total) && total > 0 && successes >= 0;
  if (!isValid || successes > total) {
    throw new RangeError('Contagem inválida para o intervalo de Wilson.');
  }
}

function clampToUnit(value: EngineDecimalValue): EngineDecimalValue {
  return EngineDecimal.min(EngineDecimal.max(value, 0), 1);
}

// Intervalo de Wilson de 95% para `successes` em `total`: o limite de baixo desce e o de cima sobe na 12ª casa, presos a [0, 1].
export function computeWilsonInterval(params: ComputeWilsonIntervalParams): WilsonInterval {
  assertCounts(params);
  const successes = new EngineDecimal(params.successes);
  const total = new EngineDecimal(params.total);
  const centre = successes.plus(Z_SQUARED.times(HALF));
  const spread = Z.times(
    successes.times(total.minus(successes)).dividedBy(total).plus(Z_SQUARED.times(QUARTER)).sqrt(),
  );
  const divisor = total.plus(Z_SQUARED);
  const lower = clampToUnit(centre.minus(spread).dividedBy(divisor));
  const upper = clampToUnit(centre.plus(spread).dividedBy(divisor));
  return {
    lower: formatEngineDecimal(
      lower.toDecimalPlaces(WILSON_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR),
    ),
    upper: formatEngineDecimal(
      upper.toDecimalPlaces(WILSON_DECIMAL_PLACES, EngineDecimal.ROUND_CEIL),
    ),
  };
}

// Limite de baixo > 1/2 ⇔ 2k > n e n(2k − n)² > z²(4k(n − k) + z²n); o de cima < 1/2 ⇔ 2k < n e a mesma desigualdade.
function judgeVerdict(params: JudgeAgainstCoinFlipParams): CoinFlipVerdict {
  if (params.counted < COIN_FLIP_MINIMUM_COUNTED) return COIN_FLIP_VERDICT.TOO_FEW;
  const { numerator, denominator } = WILSON_Z_SQUARED;
  const hits = BigInt(params.hits);
  const counted = BigInt(params.counted);
  const left = denominator * denominator * counted * (2n * hits - counted) ** 2n;
  const right = numerator * (denominator * 4n * hits * (counted - hits) + numerator * counted);
  if (left <= right) return COIN_FLIP_VERDICT.EVEN;
  return 2n * hits > counted ? COIN_FLIP_VERDICT.ABOVE : COIN_FLIP_VERDICT.BELOW;
}

// O acerto do lado contra a moeda ao ar: `too_few` abaixo de 30 contadas, senão o intervalo de Wilson decide.
export function judgeAgainstCoinFlip(params: JudgeAgainstCoinFlipParams): CoinFlipJudgement {
  const verdict = judgeVerdict(params);
  if (params.counted === 0) return { verdict, lower: null, upper: null };
  const interval = computeWilsonInterval({ successes: params.hits, total: params.counted });
  return { verdict, ...interval };
}
