// Copyright (c) 2026 Ada Technology. All rights reserved.
import { toEngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import { SURVIVAL_ERROR_CODE } from './survival.constant.js';
import { SurvivalInputError } from './survival.error.js';
import { parseSurvivalSettings } from './survival-settings.schema.js';
import type { ComputeBalanceSurvivalParams, SurvivalPoint } from './survival.types.js';

// Saldo e patrimônio nunca são negativos nem têm expoente; o banco pode devolver zeros à direita ("9000.00000000").
const AMOUNT_PATTERN = /^\d{1,30}(\.\d{1,30})?$/;

export type ParsedPoint = {
  readonly candleOpenTime: number;
  readonly equity: EngineDecimalValue;
  readonly equityAtLow: EngineDecimalValue;
};

export type ParsedSurvivalInput = {
  readonly initial: EngineDecimalValue;
  readonly floorRate: EngineDecimalValue;
  readonly doubleRate: EngineDecimalValue;
  readonly startTime: number;
  readonly durationMilliseconds: number;
  readonly points: readonly ParsedPoint[];
};

function isMilliseconds(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function parseAmount(
  text: string,
  code: 'INVALID_INITIAL_BALANCE' | 'INVALID_POINT',
): EngineDecimalValue {
  if (!AMOUNT_PATTERN.test(text)) {
    throw new SurvivalInputError(code, 'Valor monetário inválido: use texto decimal não negativo.');
  }
  return toEngineDecimal(text);
}

function parsePoint(point: SurvivalPoint): ParsedPoint {
  if (!isMilliseconds(point.candleOpenTime)) {
    throw new SurvivalInputError(
      SURVIVAL_ERROR_CODE.INVALID_POINT,
      'A abertura do candle precisa ser um inteiro de milissegundos não negativo.',
    );
  }
  return {
    candleOpenTime: point.candleOpenTime,
    equity: parseAmount(point.equity, SURVIVAL_ERROR_CODE.INVALID_POINT),
    equityAtLow: parseAmount(point.equityAtLow, SURVIVAL_ERROR_CODE.INVALID_POINT),
  };
}

function parsePoints(points: readonly SurvivalPoint[]): readonly ParsedPoint[] {
  let previous = -1;
  return points.map((point) => {
    const parsed = parsePoint(point);
    if (parsed.candleOpenTime <= previous) {
      throw new SurvivalInputError(
        SURVIVAL_ERROR_CODE.POINTS_OUT_OF_ORDER,
        'Os pontos precisam vir em ordem estritamente crescente de candle.',
      );
    }
    previous = parsed.candleOpenTime;
    return parsed;
  });
}

// Recusa em voz alta, com código estável e sem repetir o valor recebido.
export function parseSurvivalInput(params: ComputeBalanceSurvivalParams): ParsedSurvivalInput {
  const initial = parseAmount(params.initialBalance, SURVIVAL_ERROR_CODE.INVALID_INITIAL_BALANCE);
  if (!initial.greaterThan(0)) {
    throw new SurvivalInputError(
      SURVIVAL_ERROR_CODE.INVALID_INITIAL_BALANCE,
      'O saldo inicial precisa ser positivo.',
    );
  }
  const { startTime, durationMilliseconds } = params;
  if (
    !isMilliseconds(startTime) ||
    !Number.isSafeInteger(durationMilliseconds) ||
    durationMilliseconds <= 0
  ) {
    throw new SurvivalInputError(SURVIVAL_ERROR_CODE.INVALID_TIME, 'Início ou duração inválidos.');
  }
  const settings = parseSurvivalSettings(params.settings);
  return {
    initial,
    floorRate: toEngineDecimal(settings.floorRate),
    doubleRate: toEngineDecimal(settings.doubleRate),
    startTime,
    durationMilliseconds,
    points: parsePoints(params.points),
  };
}
