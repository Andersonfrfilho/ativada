// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ROUNDING_DIRECTION } from '@ativada/strategy-engine';

import { formatAmount, formatPrice, formatRatePercent } from '../live-status/live-number-format.js';
import type { TradeResult } from './trade-plan-math.js';
import type {
  AvailableTeamPlanView,
  AwaitingEntryPlanView,
  HoldingPlanView,
  ProtectiveLevelView,
} from './trade-plan-view.js';
import {
  TEAM_PLAN_UNAVAILABLE_REASON,
  TRADE_PLAN_UNAVAILABLE_REASON,
  type TeamPlanUnavailableReason,
  type TradePlanUnavailableReason,
} from './trade-plan.constant.js';

const { DOWN } = ROUNDING_DIRECTION;
const ZERO_AMOUNT = '0,00';
const NO_QUANTITY = 'Com o saldo de agora, a simulação não compraria nenhuma quantidade.';

// Catálogo FECHADO (pt-BR, sem data nem hora: o painel mostra os instantes no fuso do usuário).
export const TRADE_PLAN_NOTICE =
  'Estimativa da simulação, com taxa e deslizamento já descontados. Não é recomendação de compra ou venda: o preço pode nunca chegar lá.';

const UNAVAILABLE_MESSAGE: Readonly<Record<TradePlanUnavailableReason, string>> = {
  [TRADE_PLAN_UNAVAILABLE_REASON.NOT_RUNNING]:
    'A simulação não está rodando: não há próxima compra nem venda a estimar.',
  [TRADE_PLAN_UNAVAILABLE_REASON.STALLED]:
    'A simulação está parada esperando o sistema voltar: as estimativas voltam com a próxima vela decidida.',
  [TRADE_PLAN_UNAVAILABLE_REASON.WAITING_FOR_DATA]:
    'A simulação espera velas que faltam: as estimativas voltam quando elas chegarem.',
  [TRADE_PLAN_UNAVAILABLE_REASON.NO_CANDLE]:
    'Ainda sem vela decidida: as estimativas aparecem depois da primeira decisão.',
  [TRADE_PLAN_UNAVAILABLE_REASON.NO_ATR]:
    'A estratégia ainda junta velas para medir a volatilidade (ATR): sem ela não há stop nem alvo.',
  [TRADE_PLAN_UNAVAILABLE_REASON.INVALID_STOP]:
    'A volatilidade está pequena demais para este par: o stop ficaria acima da venda possível e a simulação não compraria.',
};

export function describeUnavailable(reason: TradePlanUnavailableReason): string {
  return UNAVAILABLE_MESSAGE[reason];
}

// Resultado com sinal, para BAIXO a 2 casas (o ganho nunca aparece maior, a perda nunca menor); zero fica sem sinal.
export function formatSignedAmount(net: string): string {
  const text = formatAmount(net, DOWN);
  return text.startsWith('−') || text === ZERO_AMOUNT ? text : `+${text}`;
}

function formatResult(result: TradeResult): string {
  return `${formatSignedAmount(result.net)} USDT (${formatRatePercent(result.rate, DOWN)}%)`;
}

function describeExits(target: ProtectiveLevelView, stop: ProtectiveLevelView): string {
  if (target.result === null || stop.result === null) return NO_QUANTITY;
  return (
    `No alvo (${formatPrice(target.price)}) o resultado seria ${formatResult(target.result)}; ` +
    `no stop (${formatPrice(stop.price)}), ${formatResult(stop.result)}.`
  );
}

export function describeAwaiting(view: Omit<AwaitingEntryPlanView, 'message'>): string {
  const entry = formatPrice(view.entry.price);
  const opening =
    view.orderType === 'limit'
      ? `Se a estratégia comprar, a ordem limitada sai a ${entry} USDT ou menos.`
      : `Se a estratégia comprar na próxima vela, a compra simulada sai perto de ${entry} USDT.`;
  return `${opening} ${describeExits(view.target, view.stop)}`;
}

export function describeHolding(view: Omit<HoldingPlanView, 'message'>): string {
  return (
    `Comprada a ${formatPrice(view.entryPrice)} USDT. Vendendo agora, a simulação sairia a ` +
    `${formatPrice(view.exit.price)} USDT: ${formatResult(view.exit.result)}. ${describeExits(view.target, view.stop)}`
  );
}

export function describeTeamAvailable(view: Omit<AvailableTeamPlanView, 'message'>): string {
  const confidence = view.confidence === null ? '' : ` (confiança ${view.confidence} de 100)`;
  const suggestion =
    `${view.displayName} sugere comprar perto de ${formatPrice(view.entry.suggestedPrice)} USDT, vender a ` +
    `${formatPrice(view.target.price)} e proteger em ${formatPrice(view.stop.price)}${confidence}.`;
  return `${suggestion} ${describeExits(view.target, view.stop)} É opinião de modelo, não ordem.`;
}

const TEAM_UNAVAILABLE_MESSAGE: Readonly<Record<TeamPlanUnavailableReason, string>> = {
  [TEAM_PLAN_UNAVAILABLE_REASON.NO_REPORT]: 'ainda não tem leitura decidida deste par.',
  [TEAM_PLAN_UNAVAILABLE_REASON.NO_ENTRY]: 'não sugere compra agora: não há entrada a medir.',
  [TEAM_PLAN_UNAVAILABLE_REASON.INVALID_LEVELS]:
    'sugeriu preços que não cabem na simulação (proteção acima da venda possível ou alvo abaixo da compra).',
};

export function describeTeamUnavailable(
  displayName: string,
  reason: TeamPlanUnavailableReason,
): string {
  return `${displayName} ${TEAM_UNAVAILABLE_MESSAGE[reason]}`;
}
