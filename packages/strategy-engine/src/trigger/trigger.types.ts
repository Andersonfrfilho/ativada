// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SentimentObservation } from '../engine-candle.types.js';
import type { EngineDecimalValue } from '../engine-decimal.js';
import type { SignalAction, StrategyFamily, RuleKind } from '../engine-vocabulary.constant.js';
import type { ScoreboardReadings } from '../rule-reading.types.js';
import type { StrategyConfig } from '../strategy-config.types.js';
import type {
  TriggerBasis,
  TriggerDirection,
  TriggerMetric,
  TriggerState,
} from './trigger.constant.js';

// Tudo texto decimal: o valor atual e o limiar na unidade da métrica, e a distância que ainda falta (positiva) ou
// que já foi passada (zero ou negativa), sempre arredondada para o lado de quem espera (mais longe).
export type RuleTrigger = {
  readonly ruleId: string;
  readonly kind: RuleKind;
  readonly family: StrategyFamily;
  readonly vote: -1 | 0 | 1;
  readonly weight: string;
  readonly isMet: boolean;
  readonly metric: TriggerMetric;
  readonly direction: TriggerDirection;
  readonly basis: TriggerBasis;
  readonly current: string | null;
  readonly threshold: string | null;
  readonly distance: string | null;
  // Só nas métricas de preço: a distância como fração do fechamento atual.
  readonly distanceRate: string | null;
};

export type NextTriggers = {
  readonly version: string;
  readonly state: TriggerState;
  readonly action: SignalAction;
  readonly score: string;
  // O limiar do placar que o estado persegue (compra aguardando, venda comprado) e quanto falta até ele.
  readonly scoreThreshold: string;
  readonly scoreGap: string;
  readonly rules: readonly RuleTrigger[];
};

export type ComputeNextTriggersParams = {
  readonly config: StrategyConfig;
  readonly readings: ScoreboardReadings;
  readonly close: string;
  readonly closeTime: number;
  readonly sentiment: SentimentObservation | undefined;
  readonly sentimentSource: string;
  readonly state: TriggerState;
};

// A leitura de uma regra já na unidade da métrica; `current` nulo só no sentimento sem observação fresca.
export type TriggerMeasure = {
  readonly metric: TriggerMetric;
  readonly entryDirection: TriggerDirection;
  readonly basis: TriggerBasis;
  readonly current: EngineDecimalValue | null;
  readonly entryThreshold: EngineDecimalValue;
  readonly exitThreshold: EngineDecimalValue;
};
