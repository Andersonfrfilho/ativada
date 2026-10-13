// Copyright (c) 2026 Ada Technology. All rights reserved.
export const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';
export const UTC_TIME_ZONE = 'UTC';

const LOCALE = 'pt-BR';
const OFFSET_LOCALE = 'en-US';
const MINUS = '−';
const DAY_TEXT_LENGTH = 10;
const OFFSET_PATTERN = /^GMT(?:([+-])(\d{2}):(\d{2}))?$/;

type ZonedOptions = Intl.DateTimeFormatOptions & { readonly timeZone: string };

const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();
const offsetFormats = new Map<string, Intl.DateTimeFormat>();

function cachedFormat(
  cache: Map<string, Intl.DateTimeFormat>,
  locale: string,
  options: ZonedOptions,
): Intl.DateTimeFormat {
  const known = cache.get(options.timeZone);
  if (known !== undefined) return known;
  const created = new Intl.DateTimeFormat(locale, options);
  cache.set(options.timeZone, created);
  return created;
}

// Um nome IANA que o `Intl` não conhece cai no fuso padrão, nunca em erro de tela.
export function resolveTimeZone(timeZone: string | undefined): string {
  if (timeZone === undefined) return DEFAULT_TIME_ZONE;
  try {
    return new Intl.DateTimeFormat(LOCALE, { timeZone }).resolvedOptions().timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

// `milliseconds` é UTC; a conversão para o fuso (e o horário de verão) é do `Intl`.
export function formatInZone(milliseconds: number, timeZone: string): string {
  const parts = cachedFormat(dateTimeFormats, LOCALE, {
    timeZone: resolveTimeZone(timeZone),
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(milliseconds);
  const part = (type: string): string => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('day')}/${part('month')}/${part('year')} ${part('hour')}:${part('minute')}`;
}

// "GMT−3", "GMT+5:30" ou "GMT" (UTC): o deslocamento vigente em `instant`, que muda com o horário de verão.
export function zoneLabel(timeZone: string, instant: number): string {
  const parts = cachedFormat(offsetFormats, OFFSET_LOCALE, {
    timeZone: resolveTimeZone(timeZone),
    timeZoneName: 'longOffset',
  }).formatToParts(instant);
  const offsetText = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = OFFSET_PATTERN.exec(offsetText);
  if (match === null || match[1] === undefined) return 'GMT';
  const hours = Number(match[2]);
  const minutes = match[3] === undefined || match[3] === '00' ? '' : `:${match[3]}`;
  if (hours === 0 && minutes === '') return 'GMT';
  return `GMT${match[1] === '-' ? MINUS : '+'}${hours}${minutes}`;
}

// Só o dia ("15/01/2026") no fuso do usuário, para rótulos de eixo e descrições.
export function formatDayInZone(milliseconds: number, timeZone: string): string {
  return formatInZone(milliseconds, timeZone).slice(0, DAY_TEXT_LENGTH);
}
