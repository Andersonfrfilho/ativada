// Copyright (c) 2026 Ada Technology. All rights reserved.
import { GOAL_RUN_OUTCOME, type GoalRunOutcome } from '@ativada/database';
import { ROUNDING_DIRECTION, toEngineDecimal } from '@ativada/strategy-engine';

import type { BuyAndHold, LiveBalance } from './live-balance.js';
import type { LiveGoalProgress } from './live-goal-progress.js';
import {
  formatAmount,
  formatExactPercent,
  formatRatePercent,
  MINUS_SIGN,
} from './live-number-format.js';
import { BUY_AND_HOLD_COMPARISON } from './live-status.constant.js';

const { UP, DOWN } = ROUNDING_DIRECTION;
const NO_CANDLE_YET = 'Ainda sem vela fechada; o saldo é o inicial:';
const EVEN_MESSAGE =
  'A estratégia está empatada com comprar e segurar no mesmo período (diferença menor que 0,01 ponto percentual).';

const OUTCOME_MESSAGE: Readonly<Record<GoalRunOutcome, string>> = {
  [GOAL_RUN_OUTCOME.REACHED]: 'Meta alcançada.',
  [GOAL_RUN_OUTCOME.STOPPED]: 'A simulação parou na perda máxima aceita.',
  [GOAL_RUN_OUTCOME.EXPIRED]: 'O prazo da meta acabou.',
};

// Saldo e resultado: tudo para BAIXO, o arredondamento nunca favorece a estratégia (ADR 0002, spec 008, L6 e L9).
export function buildBalanceMessage(params: {
  readonly balance: LiveBalance;
  readonly hasEquityPoint: boolean;
}): string {
  const { balance } = params;
  const initial = `${formatAmount(balance.initial, DOWN)} USDT`;
  if (!params.hasEquityPoint) return `${NO_CANDLE_YET} ${initial}.`;
  const current = `${formatAmount(balance.current, DOWN)} USDT`;
  const result = `${formatAmount(balance.result, DOWN)} USDT (${formatRatePercent(balance.resultRate, DOWN)}%)`;
  return `Seu saldo agora: ${current} (começou com ${initial}). Resultado: ${result}.`;
}

function describePoints(text: string, direction: typeof UP | typeof DOWN): string {
  const formatted = formatAmount(text, direction);
  return `${formatted} ${formatted === '1,00' ? 'ponto percentual' : 'pontos percentuais'}`;
}

// A diferença contra "comprar e segurar" (L7): acima desce, abaixo sobe (o módulo), empate cita o limiar.
export function buildBuyAndHoldMessage(buyAndHold: BuyAndHold): string {
  if (buyAndHold.comparison === BUY_AND_HOLD_COMPARISON.EVEN) return EVEN_MESSAGE;
  const isAbove = buyAndHold.comparison === BUY_AND_HOLD_COMPARISON.ABOVE;
  const points = isAbove
    ? describePoints(buyAndHold.differencePoints, DOWN)
    : describePoints(toEngineDecimal(buyAndHold.differencePoints).abs().toFixed(), UP);
  return `A estratégia está ${points} ${isAbove ? 'acima' : 'abaixo'} de comprar e segurar no mesmo período.`;
}

export type GoalMessageParams = {
  readonly progress: LiveGoalProgress;
  readonly horizonDays: number;
  readonly outcome: GoalRunOutcome | undefined;
};

// A meta sem data nem hora (o servidor não conhece o fuso, L9): alvo e prazo em dias, o que falta e o que ainda cabe.
export function buildGoalMessage(params: GoalMessageParams): string {
  const { progress, horizonDays, outcome } = params;
  if (outcome !== undefined) return OUTCOME_MESSAGE[outcome];
  const days = `${horizonDays} ${horizonDays === 1 ? 'dia' : 'dias'}`;
  const target = `+${formatExactPercent(progress.targetRate)}% em ${days} → chegar a ${formatAmount(progress.targetAmount, UP)} USDT`;
  const remaining = `${formatAmount(progress.remainingAmount, UP)} USDT (${formatRatePercent(progress.remainingRate, UP)}%)`;
  const loss = `${MINUS_SIGN}${formatExactPercent(progress.maxLossRate)}% (${formatAmount(progress.floorAmount, UP)} USDT)`;
  const room = `${formatAmount(progress.lossRoomAmount, DOWN)} USDT`;
  return `Meta: ${target}. Faltam ${remaining}. Perda máxima aceita: ${loss}; ainda cabem ${room} de queda.`;
}
