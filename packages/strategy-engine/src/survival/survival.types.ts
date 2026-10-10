// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SURVIVAL_VERSION } from './survival.constant.js';

// Frações do saldo inicial, em texto decimal canônico: `floorRate` ∈ (0, 1) e `doubleRate` ∈ (1, 100].
export type SurvivalSettings = {
  readonly floorRate: string;
  readonly doubleRate: string;
};

// Um ponto da curva de patrimônio da execução: o fechamento (`equity`) e o vale do candle (`equityAtLow`).
export type SurvivalPoint = {
  readonly candleOpenTime: number;
  readonly equity: string;
  readonly equityAtLow: string;
};

export type ComputeBalanceSurvivalParams = {
  readonly initialBalance: string;
  // Início da simulação (ms): pontos de candles anteriores a ele são aquecimento e não contam.
  readonly startTime: number;
  readonly durationMilliseconds: number;
  readonly settings: SurvivalSettings;
  readonly points: readonly SurvivalPoint[];
};

export type SurvivalMilestone = {
  // O saldo que define o marco, arredondado contra o usuário (para cima).
  readonly level: string;
  readonly isReached: boolean;
  readonly reachedAtCandleTime: number | null;
  // Do início ao FECHAMENTO do candle em que o marco foi observado; `null` enquanto não atingido.
  readonly elapsedMilliseconds: number | null;
  // Fração 0..1 do caminho já percorrido (`1` quando atingido): consumo do piso para cima, ganho do dobro para baixo.
  readonly progress: string;
};

export type BalanceSurvival = {
  readonly version: typeof SURVIVAL_VERSION;
  readonly initialBalance: string;
  readonly floor: SurvivalMilestone;
  readonly double: SurvivalMilestone;
  readonly lowestEquity: string | null;
  readonly highestEquity: string | null;
  readonly observedUntilCandleTime: number | null;
  readonly observedMilliseconds: number;
};
