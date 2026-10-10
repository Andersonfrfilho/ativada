// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AlertInput, AlertSide } from '@cryptoada/database';
import {
  EngineDecimal,
  formatEngineDecimal,
  ORDER_PURPOSE,
  ORDER_STATUS,
  ORDER_TYPE,
  SIGNAL_ACTION,
  type EngineCandle,
  type EngineState,
  type OrderEvent,
  type SignalAction,
  type SignalDecision,
  type StepDecisions,
} from '@cryptoada/strategy-engine';

import {
  SIMULATED_ACTION,
  type AlertPayload,
  type SimulatedAction,
} from './alert-payload.schema.js';
import type { HistoricalHitRate } from './live-run.types.js';

export type BuildStepAlertParams = {
  readonly signal: AlertableSignal;
  readonly decisions: StepDecisions;
  readonly candle: EngineCandle;
  readonly state: EngineState;
  readonly hitRate: HistoricalHitRate | undefined;
};

type Protection = { readonly stopPrice: string | null; readonly targetPrice: string | null };

// A ordem que o SINAL provocou neste fechamento: a entrada (BUY) ou a venda a mercado (SELL). Stop e alvo também nascem e
// preenchem no candle, mas são a proteção da posição, não a ação do sinal; recusada, cancelada ou ausente = nenhuma ação.
function findNewOrder(
  decisions: StepDecisions,
  params: { readonly candle: EngineCandle; readonly action: SignalAction },
): OrderEvent | undefined {
  const isBuy = params.action === SIGNAL_ACTION.BUY;
  return decisions.orders.find(
    (order) =>
      order.status === ORDER_STATUS.CREATED &&
      order.createdCandleOpenTime === params.candle.openTime &&
      (isBuy
        ? order.purpose === ORDER_PURPOSE.ENTRY
        : order.purpose === ORDER_PURPOSE.EXIT && order.type === ORDER_TYPE.MARKET),
  );
}

function simulatedActionOf(order: OrderEvent | undefined): SimulatedAction {
  if (order === undefined) return SIMULATED_ACTION.NONE;
  return order.purpose === ORDER_PURPOSE.ENTRY ? SIMULATED_ACTION.ENTER : SIMULATED_ACTION.EXIT;
}

// Entrada nova: a referência é o fechamento do candle do sinal (a execução real é na abertura seguinte, com slippage), mais e
// menos as distâncias que a ordem guardou. Sem entrada: os níveis da posição que já existe, se existir.
function protectionOf(params: BuildStepAlertParams, order: OrderEvent | undefined): Protection {
  if (
    order?.purpose === ORDER_PURPOSE.ENTRY &&
    order.stopDistance !== null &&
    order.targetDistance !== null
  ) {
    const close = new EngineDecimal(params.candle.close);
    return {
      stopPrice: formatEngineDecimal(close.minus(order.stopDistance)),
      targetPrice: formatEngineDecimal(close.plus(order.targetDistance)),
    };
  }
  const position = params.state.wallet.position;
  return { stopPrice: position?.stopPrice ?? null, targetPrice: position?.targetPrice ?? null };
}

// Só BUY e SELL geram alerta; HOLD e candle sem sinal (aquecimento) não geram nada.
export type AlertableSignal = SignalDecision & { readonly action: AlertSide };

export function isAlertableSignal(signal: SignalDecision | null): signal is AlertableSignal {
  return signal !== null && signal.action !== SIGNAL_ACTION.HOLD;
}

export function buildStepAlert(params: BuildStepAlertParams): AlertInput {
  const { signal } = params;
  const order = findNewOrder(params.decisions, { candle: params.candle, action: signal.action });
  const payload: AlertPayload = {
    symbol: params.candle.symbol,
    timeframe: params.candle.timeframe,
    closePrice: params.candle.close,
    score: signal.score,
    regime: signal.regime,
    reason: signal.reason,
    simulatedAction: simulatedActionOf(order),
    ...protectionOf(params, order),
    hitRate: params.hitRate ?? null,
  };
  return { candleTime: signal.candleOpenTime, side: signal.action, payload };
}
