// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

const INSTANT_MAXIMUM_LENGTH = 64;
const MAXIMUM_OFFSET_HOURS = 15;
const INSTANT_PATTERN =
  /^(?!0000)(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})[ T](?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.\d{1,6})?(?:Z|[+-](?<offsetHour>\d{2})(?::?(?<offsetMinute>\d{2}))?)?$/;

function isCalendarInstant(text: string): boolean {
  const groups = INSTANT_PATTERN.exec(text)?.groups;
  if (groups === undefined) return false;
  const { year, month, day, hour, minute, second, offsetHour, offsetMinute } = Object.fromEntries(
    Object.entries(groups).map(([name, part]) => [name, Number(part ?? 0)]),
  );
  const date = new Date(0);
  date.setUTCFullYear(year ?? 0, (month ?? 0) - 1, day);
  const isCalendarDate =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === (month ?? 0) - 1 &&
    date.getUTCDate() === day;
  const isClockTime = (hour ?? 0) < 24 && (minute ?? 0) < 60 && (second ?? 0) < 60;
  const isOffset = (offsetHour ?? 0) <= MAXIMUM_OFFSET_HOURS && (offsetMinute ?? 0) < 60;
  return isCalendarDate && isClockTime && isOffset;
}

// O `created_at::text` do Postgres (ou ISO): o instante vira `::timestamptz` na consulta, e texto que o banco recusa
// (22007/22008) seria 500. Aqui vira cursor adulterado (400).
export const cursorInstantSchema = z.string().max(INSTANT_MAXIMUM_LENGTH).refine(isCalendarInstant);
