// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  DEFAULT_TIME_ZONE,
  formatDayInZone,
  formatInZone,
  formatTimeInZone,
  zoneLabel,
} from './zoned-time.js';

const MILLISECONDS_PER_DAY = 86_400_000;
const BRASILIA_TEXT = 'horário de Brasília';

export type MomentContext = { readonly now: number; readonly timeZone: string };

// "21:00 de hoje", "09:00 de amanhã", "23:00 de ontem" ou a data completa quando está mais longe.
export function formatRelativeMoment(at: number, context: MomentContext): string {
  const day = formatDayInZone(at, context.timeZone);
  const time = formatTimeInZone(at, context.timeZone);
  if (day === formatDayInZone(context.now, context.timeZone)) return `${time} de hoje`;
  if (day === formatDayInZone(context.now + MILLISECONDS_PER_DAY, context.timeZone)) {
    return `${time} de amanhã`;
  }
  if (day === formatDayInZone(context.now - MILLISECONDS_PER_DAY, context.timeZone)) {
    return `${time} de ontem`;
  }
  return formatInZone(at, context.timeZone);
}

// O fuso padrão do produto é chamado pelo nome que a pessoa conhece; os demais, pelo deslocamento.
export function describeZone(timeZone: string, instant: number): string {
  return timeZone === DEFAULT_TIME_ZONE ? BRASILIA_TEXT : zoneLabel(timeZone, instant);
}
