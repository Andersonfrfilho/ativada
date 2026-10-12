// Copyright (c) 2026 Ada Technology. All rights reserved.
import { ALERT_SIDE, type SignalAlertSide } from '@ativada/database';

import {
  SIMULATED_ACTION,
  type AlertPayload,
  type SimulatedAction,
} from '../live/alert-payload.schema.js';
import { TELEGRAM_MESSAGE_MAX_LENGTH } from './alerts.constant.js';
import { formatPercent } from './format-percent.js';

const SIDE_LABEL: Readonly<Record<SignalAlertSide, string>> = {
  [ALERT_SIDE.BUY]: 'COMPRA',
  [ALERT_SIDE.SELL]: 'VENDA',
};
const REGIME_LABEL: Readonly<Record<string, string>> = {
  trending: 'tendência',
  ranging: 'lateral',
  none: 'indefinido',
};
const UNKNOWN_REGIME_LABEL = 'indefinido';
const ELLIPSIS = '…';
const DISCLAIMER = 'Simulação: sinal de regra, não é recomendação de investimento.';
const NO_HIT_RATE = 'Acerto histórico: sem walk-forward concluído para esta versão.';

function simulatedActionText(side: SignalAlertSide, action: SimulatedAction): string {
  if (action === SIMULATED_ACTION.ENTER) return 'entrar comprado na abertura do próximo candle';
  if (action === SIMULATED_ACTION.EXIT) return 'sair da posição na abertura do próximo candle';
  return side === ALERT_SIDE.BUY
    ? 'nenhuma (carteira já posicionada ou entrada bloqueada)'
    : 'nenhuma (sem posição aberta para vender)';
}

function hitRateLine(hitRate: AlertPayload['hitRate']): string {
  if (hitRate === null) return NO_HIT_RATE;
  return `Acerto histórico (fora da amostra): ${formatPercent(hitRate.winRate)} em ${hitRate.trades} operações.`;
}

function levelsLine(payload: AlertPayload): string | undefined {
  if (payload.stopPrice === null || payload.targetPrice === null) return undefined;
  return `Stop: ${payload.stopPrice} · Alvo: ${payload.targetPrice}`;
}

// O motivo é o único texto longo: se passar do limite do Telegram, é ele que encolhe, nunca o acerto nem o aviso.
function fitReason(params: { readonly reason: string; readonly fixedLength: number }): string {
  const room = TELEGRAM_MESSAGE_MAX_LENGTH - params.fixedLength;
  if (params.reason.length <= room) return params.reason;
  return `${params.reason.slice(0, Math.max(room - ELLIPSIS.length, 0))}${ELLIPSIS}`;
}

export type FormatAlertMessageParams = {
  readonly side: SignalAlertSide;
  readonly payload: AlertPayload;
};

// Só o que o conteúdo do alerta traz (mercado e regra): nenhum dado da pessoa, nenhum id, nenhum chat.
export function formatAlertMessage(params: FormatAlertMessageParams): string {
  const { side, payload } = params;
  const regime = REGIME_LABEL[payload.regime] ?? UNKNOWN_REGIME_LABEL;
  const head = [
    `${SIDE_LABEL[side]} · ${payload.symbol} ${payload.timeframe}`,
    `Preço de referência: ${payload.closePrice} (fechamento do candle)`,
    `Pontuação: ${payload.score} · Regime: ${regime}`,
  ];
  const tail = [
    `Ação simulada: ${simulatedActionText(side, payload.simulatedAction)}`,
    levelsLine(payload),
    hitRateLine(payload.hitRate),
    DISCLAIMER,
  ].filter((line): line is string => line !== undefined);
  const fixed = [...head, 'Motivo: ', ...tail].join('\n');
  const reason = fitReason({ reason: payload.reason, fixedLength: fixed.length });
  return [...head, `Motivo: ${reason}`, ...tail].join('\n');
}
