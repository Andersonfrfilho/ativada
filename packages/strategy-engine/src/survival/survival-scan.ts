// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineDecimalValue } from '../engine-decimal.js';
import type { ParsedPoint } from './survival-input.js';

export type SurvivalScan = {
  readonly floorPoint: ParsedPoint | undefined;
  readonly doublePoint: ParsedPoint | undefined;
  readonly lowest: EngineDecimalValue | undefined;
  readonly highest: EngineDecimalValue | undefined;
  readonly last: ParsedPoint | undefined;
};

export type SurvivalScanParams = {
  readonly points: readonly ParsedPoint[];
  readonly startTime: number;
  readonly floorLevel: EngineDecimalValue;
  readonly targetLevel: EngineDecimalValue;
};

// Uma passada pelos candles da simulação (os do aquecimento, antes do início, não contam). O piso olha o VALE do
// candle e vale ao TOCAR (<=); o dobro olha o fechamento e vale ao ALCANÇAR (>=): os dois lados são os piores para
// o usuário. Cada marco guarda a PRIMEIRA vez e nunca é desfeito.
export function scanSurvival(params: SurvivalScanParams): SurvivalScan {
  let floorPoint: ParsedPoint | undefined;
  let doublePoint: ParsedPoint | undefined;
  let lowest: EngineDecimalValue | undefined;
  let highest: EngineDecimalValue | undefined;
  let last: ParsedPoint | undefined;
  for (const point of params.points) {
    if (point.candleOpenTime < params.startTime) continue;
    if (floorPoint === undefined && point.equityAtLow.lte(params.floorLevel)) floorPoint = point;
    if (doublePoint === undefined && point.equity.gte(params.targetLevel)) doublePoint = point;
    if (lowest === undefined || point.equityAtLow.lt(lowest)) lowest = point.equityAtLow;
    if (highest === undefined || point.equity.gt(highest)) highest = point.equity;
    last = point;
  }
  return { floorPoint, doublePoint, lowest, highest, last };
}
