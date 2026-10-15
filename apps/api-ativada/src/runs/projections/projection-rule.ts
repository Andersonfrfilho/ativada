// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, formatEngineDecimal, toEngineDecimal } from '@ativada/strategy-engine';

import {
  PROJECTION_BAND_DECIMAL_PLACES,
  PROJECTION_RATE_DECIMAL_PLACES,
  PROJECTION_RESULT,
  PROJECTION_SIDE,
  PROJECTION_STANCE,
  PROJECTION_STRENGTH,
  type ProjectionResult,
  type ProjectionSide,
  type ProjectionStance,
  type ProjectionStrength,
} from './projections.constant.js';

export type ProjectionThresholds = { readonly buy: string; readonly sell: string };
export type ProjectionBand = { readonly low: string; readonly high: string };
export type ProjectedMove = {
  readonly side: ProjectionSide;
  readonly close: string;
  readonly nextClose: string;
};

// Para que lado o placar puxa: positivo compra, negativo vende, zero não puxa para lado nenhum.
export function readSide(score: string): ProjectionSide {
  const value = toEngineDecimal(score);
  if (value.isZero()) return PROJECTION_SIDE.NONE;
  return value.isPositive() ? PROJECTION_SIDE.BUY : PROJECTION_SIDE.SELL;
}

export function readSideThreshold(side: ProjectionSide, thresholds: ProjectionThresholds): string {
  return side === PROJECTION_SIDE.SELL ? thresholds.sell : thresholds.buy;
}

// Fração do limiar DO LADO, sem divisão: até a metade é fraco, abaixo do limiar é forte, no limiar ou além é decidido.
export function readStrength(params: {
  readonly score: string;
  readonly threshold: string;
}): ProjectionStrength {
  const score = toEngineDecimal(params.score).abs();
  const threshold = toEngineDecimal(params.threshold).abs();
  if (score.times(2).lessThanOrEqualTo(threshold)) return PROJECTION_STRENGTH.WEAK;
  return score.lessThan(threshold) ? PROJECTION_STRENGTH.STRONG : PROJECTION_STRENGTH.DECIDED;
}

// A palavra da tela: livre e puxando para a compra compra; comprada e puxando para a venda vende (`holding(t)` de L12).
export function readStance(params: {
  readonly side: ProjectionSide;
  readonly isHolding: boolean;
}): ProjectionStance | undefined {
  if (params.side === PROJECTION_SIDE.NONE) return undefined;
  const isBuySide = params.side === PROJECTION_SIDE.BUY;
  if (params.isHolding) return isBuySide ? PROJECTION_STANCE.HOLD : PROJECTION_STANCE.SELL;
  return isBuySide ? PROJECTION_STANCE.BUY : PROJECTION_STANCE.STAY_OUT;
}

// Fechamento ± ATR a 8 casas, a borda de baixo para baixo e a de cima para cima: a faixa nunca encolhe.
export function computeBand(params: {
  readonly close: string;
  readonly atr: string | null;
}): ProjectionBand | null {
  if (params.atr === null) return null;
  const close = toEngineDecimal(params.close);
  const atr = toEngineDecimal(params.atr);
  return {
    low: formatEngineDecimal(
      close.minus(atr).toDecimalPlaces(PROJECTION_BAND_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR),
    ),
    high: formatEngineDecimal(
      close.plus(atr).toDecimalPlaces(PROJECTION_BAND_DECIMAL_PLACES, EngineDecimal.ROUND_CEIL),
    ),
  };
}

export function isInsideBand(params: {
  readonly band: ProjectionBand;
  readonly nextClose: string;
}): boolean {
  const next = toEngineDecimal(params.nextClose);
  return next.greaterThanOrEqualTo(params.band.low) && next.lessThanOrEqualTo(params.band.high);
}

// Acertou o lado quando o fechamento seguinte foi para onde o placar apontava; igual é empate e não conta.
export function judgeMove(params: ProjectedMove): ProjectionResult {
  if (params.side === PROJECTION_SIDE.NONE) return PROJECTION_RESULT.NO_SIDE;
  const difference = toEngineDecimal(params.nextClose).minus(params.close);
  if (difference.isZero()) return PROJECTION_RESULT.TIE;
  const wentUp = difference.isPositive();
  return wentUp === (params.side === PROJECTION_SIDE.BUY)
    ? PROJECTION_RESULT.HIT
    : PROJECTION_RESULT.MISS;
}

// (seguinte − fechamento) ÷ fechamento a 4 casas para BAIXO (rumo a −∞): a taxa nunca sobe por arredondamento.
export function computeMoveRate(params: {
  readonly close: string;
  readonly nextClose: string;
}): string {
  const close = toEngineDecimal(params.close);
  const rate = toEngineDecimal(params.nextClose).minus(close).dividedBy(close);
  return formatEngineDecimal(
    rate.toDecimalPlaces(PROJECTION_RATE_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR),
  );
}

// Parte ÷ total a 4 casas para baixo; `null` sem denominador.
export function computeRate(params: {
  readonly part: number;
  readonly total: number;
}): string | null {
  if (params.total === 0) return null;
  const rate = new EngineDecimal(params.part).dividedBy(params.total);
  return formatEngineDecimal(
    rate.toDecimalPlaces(PROJECTION_RATE_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR),
  );
}
