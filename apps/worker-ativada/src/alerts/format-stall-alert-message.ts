// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ResumeAlertPayload, StallAlertPayload } from '../live/alert-payload.schema.js';

const DISCLAIMER = 'Simulação: nenhum dinheiro real foi usado.';
const NO_LOSS_LINE = 'Nenhuma operação foi perdida.';
const TIME_ZONE_LABEL = 'UTC';
const DATE_TIME_LENGTH = 16;

// "13/10 14:05 UTC": o worker não conhece o fuso da pessoa, então o horário vai em UTC com o rótulo.
function formatUtcDateTime(milliseconds: number): string {
  const iso = new Date(milliseconds).toISOString().slice(0, DATE_TIME_LENGTH);
  const [date = '', time = ''] = iso.split('T');
  const [, month = '', day = ''] = date.split('-');
  return `${day}/${month} ${time} ${TIME_ZONE_LABEL}`;
}

// A parada no Telegram: só o que o conteúdo traz (par, vela, horário), nada da pessoa, da estratégia, de id ou de chat.
export function formatStallAlertMessage(payload: StallAlertPayload): string {
  return [
    `Simulação parada · ${payload.symbol} ${payload.timeframe}`,
    `Está sem avançar desde ${formatUtcDateTime(payload.stalledSince)}. O sistema está tentando retomar.`,
    NO_LOSS_LINE,
    DISCLAIMER,
  ].join('\n');
}

export function formatResumeAlertMessage(payload: ResumeAlertPayload): string {
  return [
    `Simulação voltou · ${payload.symbol} ${payload.timeframe}`,
    `Ficou parada desde ${formatUtcDateTime(payload.stalledSince)} e voltou a andar às ${formatUtcDateTime(payload.resumedAt)}.`,
    NO_LOSS_LINE,
    DISCLAIMER,
  ].join('\n');
}
