// Copyright (c) 2026 Ada Technology. All rights reserved.
import { GOAL_RUN_OUTCOME, type GoalRunOutcome } from '@cryptoada/database';

import type { GoalAlertPayload } from '../live/alert-payload.schema.js';
import { formatPercent, formatSignedPercent } from './format-percent.js';

const DISCLAIMER =
  'Simulação: resultado de regra sobre o histórico, não é recomendação de investimento.';
const CLOSING_LINE =
  'Qualquer posição aberta é vendida na abertura do próximo candle e a simulação termina.';

const TITLE: Readonly<Record<GoalRunOutcome, string>> = {
  [GOAL_RUN_OUTCOME.REACHED]: 'Meta atingida',
  [GOAL_RUN_OUTCOME.STOPPED]: 'Perda máxima atingida',
  [GOAL_RUN_OUTCOME.EXPIRED]: 'Prazo da meta vencido',
};

const RESULT_VERB: Readonly<Record<GoalRunOutcome, string>> = {
  [GOAL_RUN_OUTCOME.REACHED]: 'A simulação chegou a',
  [GOAL_RUN_OUTCOME.STOPPED]: 'A simulação caiu a',
  [GOAL_RUN_OUTCOME.EXPIRED]: 'Ao fim do prazo a simulação ficou em',
};

// O desfecho de uma meta no Telegram: só o que o conteúdo traz (mercado e meta), nada da pessoa, nenhum id, nenhum chat.
export function formatGoalAlertMessage(payload: GoalAlertPayload): string {
  return [
    `${TITLE[payload.outcome]} · ${payload.symbol} ${payload.timeframe}`,
    `${RESULT_VERB[payload.outcome]} ${formatSignedPercent(payload.resultRate)} do saldo inicial.`,
    `Meta: ${formatPercent(payload.targetRate)} em ${payload.horizonDays} dias, perda máxima de ${formatPercent(payload.maxLossRate)}.`,
    `Patrimônio simulado: ${payload.finalValue} (saldo inicial ${payload.initialBalance}).`,
    CLOSING_LINE,
    DISCLAIMER,
  ].join('\n');
}
