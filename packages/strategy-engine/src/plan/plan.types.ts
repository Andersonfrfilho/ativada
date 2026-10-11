// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SignalAction, RuleKind, StrategyFamily } from '../engine-vocabulary.constant.js';
import type { PlanBasis, PlanDirection, PlanStatus, PlanTrigger } from './plan.constant.js';

// Tudo texto decimal. `price` fica na grade do tick e `trigger` diz de que lado dele a regra dispara (o vizinho de um tick do
// outro lado NÃO dispara); `distance` e `distanceRate` são a distância ABSOLUTA até o último fechamento (para cima, a 8
// casas) e `direction` diz de que lado do fechamento o preço está.
export type PlanLevel = {
  readonly status: PlanStatus;
  readonly price: string | null;
  readonly trigger: PlanTrigger | null;
  readonly direction: PlanDirection | null;
  readonly distance: string | null;
  readonly distanceRate: string | null;
};

export type PlanRuleLevels = {
  readonly ruleId: string;
  readonly kind: RuleKind;
  readonly family: StrategyFamily;
  readonly basis: PlanBasis;
  readonly buy: PlanLevel;
  readonly exit: PlanLevel;
};

// Alvo e stop como preço de VENDA já com taxas e slippage, e a taxa sobre o custo de entrada que cada um representa.
export type PlanProtectiveLevel = { readonly rate: string; readonly price: string };

export type OperationPlan = {
  readonly version: string;
  readonly lastCloseTime: number;
  readonly lastClose: string;
  readonly basis: PlanBasis;
  readonly signal: { readonly action: SignalAction; readonly score: string };
  readonly buy: PlanLevel;
  readonly exit: PlanLevel;
  // O preço de entrada de que alvo e stop partem: o de compra do plano, ou o último fechamento se o sinal já está ativo.
  readonly entryReference: string | null;
  readonly target: PlanProtectiveLevel | null;
  readonly stop: PlanProtectiveLevel | null;
  readonly startsAt: number;
  readonly deadlineAt: number;
  readonly horizonDays: number;
  readonly rules: readonly PlanRuleLevels[];
};
