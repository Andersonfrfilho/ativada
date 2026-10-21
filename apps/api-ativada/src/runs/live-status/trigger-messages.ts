// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_STATUS, type RunStatus } from '@ativada/database';
import {
  toEngineDecimal,
  TRIGGER_BASIS,
  TRIGGER_DIRECTION,
  TRIGGER_METRIC,
  TRIGGER_STATE,
  type NextTriggers,
  type RuleTrigger,
  type TriggerState,
} from '@ativada/strategy-engine';

import {
  formatDistancePercent,
  formatPoints,
  formatPrice,
  pluralizePoints,
} from './live-number-format.js';
import {
  TRIGGER_UNAVAILABLE_REASON,
  type TriggerUnavailableReason,
} from './live-status.constant.js';

const NOT_A_FORECAST =
  'Isto não é previsão: o preço pode nunca chegar lá, e outras regras podem mudar de voto antes.';
const INDICATIVE_NOTE = ' (aproximado: o indicador se move com a próxima vela)';
const NO_READING = 'ainda não há leitura para dizer o que falta';

const NOT_RUNNING_STATE: Readonly<Record<RunStatus, string>> = {
  [RUN_STATUS.QUEUED]: 'está na fila',
  [RUN_STATUS.RUNNING]: 'está rodando',
  [RUN_STATUS.COMPLETED]: 'foi concluída',
  [RUN_STATUS.FAILED]: 'terminou com falha',
  [RUN_STATUS.CANCELLED]: 'foi parada',
};

const UNAVAILABLE_MESSAGE = {
  [TRIGGER_UNAVAILABLE_REASON.TEAM_RUN]:
    'Sem gatilhos de regra: esta simulação segue a leitura de uma equipe de modelo.',
  [TRIGGER_UNAVAILABLE_REASON.NO_CANDLE]: 'Aguardando a primeira vela fechar.',
  [TRIGGER_UNAVAILABLE_REASON.WARMING_UP]:
    'O gatilho do rompimento precisa de duas velas decididas; aparece no próximo fechamento.',
} as const;

const verbOf = (state: TriggerState): string =>
  state === TRIGGER_STATE.AWAITING_ENTRY ? 'comprar' : 'vender';

function describeDirection(rule: RuleTrigger, above: string, below: string): string {
  return rule.direction === TRIGGER_DIRECTION.ABOVE ? above : below;
}

function describePrice(rule: RuleTrigger, threshold: string): string {
  const side = describeDirection(rule, 'acima', 'abaixo');
  const lead = `o preço precisa fechar ${side} de ${formatPrice(threshold)}`;
  if (rule.current === null || rule.distanceRate === null) return lead;
  return `${lead} (no último fechamento ${formatPrice(rule.current)}, faltam ${formatDistancePercent(rule.distanceRate)}%)`;
}

function describeCondition(rule: RuleTrigger, threshold: string): string {
  switch (rule.metric) {
    case TRIGGER_METRIC.CLOSE_PRICE:
      return describePrice(rule, threshold);
    case TRIGGER_METRIC.RSI:
      return `o RSI precisa ficar ${describeDirection(rule, 'acima', 'abaixo')} de ${formatPoints(threshold)}`;
    case TRIGGER_METRIC.MACD_GAP:
      return 'o MACD precisa passar a linha de sinal';
    case TRIGGER_METRIC.OBV_GAP:
      return 'o OBV precisa passar a média dele';
    case TRIGGER_METRIC.FEAR_GREED_INDEX:
      return `o Fear & Greed precisa chegar a ${formatPoints(threshold)} ${describeDirection(rule, 'ou mais', 'ou menos')}`;
  }
}

// O que falta para UMA regra votar (ADR 0002, spec 008, L15): o nome simples da regra e a condição em palavras.
export function buildTriggerRuleMessage(params: {
  readonly rule: RuleTrigger;
  readonly label: string;
  readonly state: TriggerState;
}): string {
  const { rule, label, state } = params;
  if (rule.isMet) return `${label}: já vota para ${verbOf(state)}.`;
  if (rule.threshold === null) return `${label}: ${NO_READING}.`;
  const note = rule.basis === TRIGGER_BASIS.INDICATIVE ? INDICATIVE_NOTE : '';
  return `${label}: ${describeCondition(rule, rule.threshold)}${note}.`;
}

// A pontuação que falta no placar e o aviso fixo de que isto não é previsão (L11).
export function buildTriggersMessage(triggers: NextTriggers): string {
  const gap = toEngineDecimal(triggers.scoreGap);
  const word = triggers.state === TRIGGER_STATE.AWAITING_ENTRY ? 'compra' : 'venda';
  const score = gap.lessThanOrEqualTo(0)
    ? `A pontuação já alcança o limiar de ${word}.`
    : `Faltam ${formatPoints(triggers.scoreGap)} ${pluralizePoints(triggers.scoreGap)} de ${formatPoints(triggers.scoreThreshold)} para ${verbOf(triggers.state)}.`;
  return `${score} ${NOT_A_FORECAST}`;
}

// Por que não há gatilho (L3): a execução não está rodando, ainda não fechou vela, ou o Donchian espera a segunda.
export function buildTriggersUnavailableMessage(params: {
  readonly reason: TriggerUnavailableReason;
  readonly runStatus: RunStatus;
}): string {
  if (params.reason === TRIGGER_UNAVAILABLE_REASON.NOT_RUNNING) {
    return `Sem gatilhos agora: a simulação ${NOT_RUNNING_STATE[params.runStatus]}.`;
  }
  return UNAVAILABLE_MESSAGE[params.reason];
}
