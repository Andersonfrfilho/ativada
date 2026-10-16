// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatDayInZone, formatTimeInZone } from '../format/zoned-time.js';
import { JUST_NOW_MILLISECONDS, TIME_TOKEN } from './notice.constant.js';
import type { Notice } from './notice.validation.js';

const QUOTE_ASSET = 'USDT';
const MINUTES_IN_HOUR = 60;
const HOURS_IN_DAY = 24;
const MILLISECONDS_PER_MINUTE = 60_000;

// "LINKUSDT" -> "LINK/USDT".
export function formatSymbol(symbol: string): string {
  if (!symbol.endsWith(QUOTE_ASSET) || symbol.length === QUOTE_ASSET.length) return symbol;
  return `${symbol.slice(0, -QUOTE_ASSET.length)}/${QUOTE_ASSET}`;
}

// "15m" -> "15 min", "1h" -> "1 h", "4h" -> "4 h", "1d" -> "1 dia".
export function formatTimeframe(timeframe: string): string {
  const amount = timeframe.slice(0, -1);
  const unit = timeframe.slice(-1);
  if (unit === 'm') return `${amount} min`;
  if (unit === 'h') return `${amount} h`;
  return unit === 'd' ? `${amount} ${amount === '1' ? 'dia' : 'dias'}` : timeframe;
}

// O par e a vela do aviso: "LINK/USDT 15 min" (alerta de preço não tem vela).
export function describeNoticePair(notice: Notice): string {
  const pair = formatSymbol(notice.symbol);
  return notice.timeframe === null ? pair : `${pair} ${formatTimeframe(notice.timeframe)}`;
}

function timeOf(instant: string | null, timeZone: string): string {
  return instant === null ? '' : formatTimeInZone(Date.parse(instant), timeZone);
}

// Troca as marcas de horário da frase do servidor pelo horário no fuso do usuário (o servidor não conhece o fuso).
export function fillTimeTokens(text: string, notice: Notice, timeZone: string): string {
  return text
    .replaceAll(TIME_TOKEN.OPENS, timeOf(notice.occurredAt, timeZone))
    .replaceAll(TIME_TOKEN.CLOSES, timeOf(notice.confirmsAt, timeZone))
    .replaceAll(TIME_TOKEN.EXPIRES, timeOf(notice.expiresAt, timeZone))
    .replaceAll(TIME_TOKEN.AT, timeOf(notice.occurredAt, timeZone));
}

// "há instantes" (menos de um minuto), "há 5 min", "há 2 h" ou "às 20:15".
export function describeWhen(params: {
  readonly occurredAt: string;
  readonly now: number;
  readonly timeZone: string;
}): string {
  const occurred = Date.parse(params.occurredAt);
  const elapsed = params.now - occurred;
  if (elapsed < JUST_NOW_MILLISECONDS) return 'há instantes';
  const minutes = Math.floor(elapsed / MILLISECONDS_PER_MINUTE);
  if (minutes < MINUTES_IN_HOUR) return `há ${minutes} min`;
  if (minutes < MINUTES_IN_HOUR * HOURS_IN_DAY) {
    return `às ${formatTimeInZone(occurred, params.timeZone)}`;
  }
  return `${formatDayInZone(occurred, params.timeZone)} às ${formatTimeInZone(occurred, params.timeZone)}`;
}

// "Hoje", "Ontem" ou a data, no fuso do usuário.
export function describeDay(params: {
  readonly occurredAt: string;
  readonly now: number;
  readonly timeZone: string;
}): string {
  const day = formatDayInZone(Date.parse(params.occurredAt), params.timeZone);
  if (day === formatDayInZone(params.now, params.timeZone)) return 'Hoje';
  const yesterday = params.now - HOURS_IN_DAY * MINUTES_IN_HOUR * MILLISECONDS_PER_MINUTE;
  return day === formatDayInZone(yesterday, params.timeZone) ? 'Ontem' : day;
}
