// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatEngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import { moneyUp } from '../money.js';
import { parseSurvivalInput, type ParsedSurvivalInput } from './survival-input.js';
import type { SurvivalSettings } from './survival.types.js';

export type SurvivalLevels = {
  readonly floorLevel: EngineDecimalValue;
  readonly targetLevel: EngineDecimalValue;
};

// O piso e a meta de dobro são frações do saldo inicial, arredondadas para cima a 8 casas (contra o usuário).
export function computeSurvivalLevels(
  input: Pick<ParsedSurvivalInput, 'initial' | 'floorRate' | 'doubleRate'>,
): SurvivalLevels {
  return {
    floorLevel: moneyUp(input.initial.times(input.floorRate)),
    targetLevel: moneyUp(input.initial.times(input.doubleRate)),
  };
}

export type DescribeSurvivalLevelsParams = {
  readonly initialBalance: string;
  readonly settings: SurvivalSettings;
};

// Os mesmos dois níveis em texto decimal, para o banco calcular os marcos sem trazer a curva (mesma validação da função pura).
export function describeSurvivalLevels(params: DescribeSurvivalLevelsParams): {
  readonly floorLevel: string;
  readonly targetLevel: string;
} {
  const input = parseSurvivalInput({
    ...params,
    startTime: 0,
    durationMilliseconds: 1,
    points: [],
  });
  const levels = computeSurvivalLevels(input);
  return {
    floorLevel: formatEngineDecimal(levels.floorLevel),
    targetLevel: formatEngineDecimal(levels.targetLevel),
  };
}
