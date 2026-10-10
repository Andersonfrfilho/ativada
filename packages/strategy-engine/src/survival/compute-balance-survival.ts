// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, formatEngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import { moneyUp } from '../money.js';
import {
  SURVIVAL_PROGRESS_COMPLETE,
  SURVIVAL_PROGRESS_DECIMAL_PLACES,
  SURVIVAL_PROGRESS_NONE,
  SURVIVAL_VERSION,
} from './survival.constant.js';
import { parseSurvivalInput, type ParsedPoint } from './survival-input.js';
import { scanSurvival } from './survival-scan.js';
import type {
  BalanceSurvival,
  ComputeBalanceSurvivalParams,
  SurvivalMilestone,
} from './survival.types.js';

// Nunca "1" sem o marco atingido: o consumo do piso arredonda para cima e chegaria a 1 a um centavo do piso.
const LARGEST_UNREACHED_PROGRESS = new EngineDecimal(1).minus(
  new EngineDecimal(10).pow(-SURVIVAL_PROGRESS_DECIMAL_PLACES),
);

type MilestoneParams = {
  readonly level: EngineDecimalValue;
  readonly reachedPoint: ParsedPoint | undefined;
  readonly progress: string;
  readonly startTime: number;
  readonly durationMilliseconds: number;
};

function buildMilestone(params: MilestoneParams): SurvivalMilestone {
  const { reachedPoint } = params;
  return {
    level: formatEngineDecimal(params.level),
    isReached: reachedPoint !== undefined,
    reachedAtCandleTime: reachedPoint?.candleOpenTime ?? null,
    elapsedMilliseconds:
      reachedPoint === undefined
        ? null
        : reachedPoint.candleOpenTime + params.durationMilliseconds - params.startTime,
    progress: reachedPoint === undefined ? params.progress : SURVIVAL_PROGRESS_COMPLETE,
  };
}

// Quanto do caminho do saldo inicial até o piso já foi consumido (pelo vale mais fundo), para CIMA.
function floorProgress(params: {
  readonly initial: EngineDecimalValue;
  readonly floorLevel: EngineDecimalValue;
  readonly lowest: EngineDecimalValue | undefined;
}): string {
  const { initial, floorLevel, lowest } = params;
  if (lowest === undefined || lowest.gte(initial) || floorLevel.gte(initial)) {
    return SURVIVAL_PROGRESS_NONE;
  }
  const consumed = initial
    .minus(lowest)
    .dividedBy(initial.minus(floorLevel))
    .toDecimalPlaces(SURVIVAL_PROGRESS_DECIMAL_PLACES, EngineDecimal.ROUND_CEIL);
  return formatEngineDecimal(EngineDecimal.min(consumed, LARGEST_UNREACHED_PROGRESS));
}

// Quanto do caminho do saldo inicial até a meta já foi ganho (pelo fechamento mais alto), para BAIXO.
function doubleProgress(params: {
  readonly initial: EngineDecimalValue;
  readonly targetLevel: EngineDecimalValue;
  readonly highest: EngineDecimalValue | undefined;
}): string {
  const { initial, targetLevel, highest } = params;
  if (highest === undefined || highest.lte(initial)) return SURVIVAL_PROGRESS_NONE;
  const gained = highest
    .minus(initial)
    .dividedBy(targetLevel.minus(initial))
    .toDecimalPlaces(SURVIVAL_PROGRESS_DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR);
  return formatEngineDecimal(gained);
}

// Sobrevivência do saldo (RF09, ADR 0002 §"Sobrevivência do saldo"): função PURA sobre a curva de patrimônio da execução.
// O piso e a meta de dobro são frações do saldo inicial, arredondadas para cima a 8 casas (contra o usuário); o tempo de
// cada marco vai do início da simulação ao fechamento do candle em que ele foi observado. Sem relógio nem sorteio.
export function computeBalanceSurvival(params: ComputeBalanceSurvivalParams): BalanceSurvival {
  const input = parseSurvivalInput(params);
  const { initial, startTime, durationMilliseconds } = input;
  const floorLevel = moneyUp(initial.times(input.floorRate));
  const targetLevel = moneyUp(initial.times(input.doubleRate));
  const scan = scanSurvival({ points: input.points, startTime, floorLevel, targetLevel });
  const { last } = scan;
  return {
    version: SURVIVAL_VERSION,
    initialBalance: formatEngineDecimal(initial),
    floor: buildMilestone({
      level: floorLevel,
      reachedPoint: scan.floorPoint,
      progress: floorProgress({ initial, floorLevel, lowest: scan.lowest }),
      startTime,
      durationMilliseconds,
    }),
    double: buildMilestone({
      level: targetLevel,
      reachedPoint: scan.doublePoint,
      progress: doubleProgress({ initial, targetLevel, highest: scan.highest }),
      startTime,
      durationMilliseconds,
    }),
    lowestEquity: scan.lowest === undefined ? null : formatEngineDecimal(scan.lowest),
    highestEquity: scan.highest === undefined ? null : formatEngineDecimal(scan.highest),
    observedUntilCandleTime: last?.candleOpenTime ?? null,
    observedMilliseconds:
      last === undefined ? 0 : last.candleOpenTime + durationMilliseconds - startTime,
  };
}
