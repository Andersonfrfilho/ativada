// Copyright (c) 2026 Ada Technology. All rights reserved.

const MILLISECONDS_PER_DAY = 86_400_000;
const MONTHS_PER_YEAR = 12;
const DAYS_PER_ERA = 146_097;
const ERA_YEARS = 400;
const FIRST_MONTH = 1;
const MARCH = 3;
const FEBRUARY = 2;
const DAYS_BEFORE_UNIX_EPOCH_ERA_OFFSET = 719_468;

type CivilDate = { readonly year: number; readonly month: number; readonly day: number };

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % ERA_YEARS === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === FEBRUARY) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

// Dias desde 1970-01-01 de uma data civil (calendário gregoriano proléptico), só com aritmética inteira.
function daysFromCivil(date: CivilDate): number {
  const year = date.month <= FEBRUARY ? date.year - 1 : date.year;
  const era = Math.floor(year / ERA_YEARS);
  const yearOfEra = year - era * ERA_YEARS;
  const shiftedMonth =
    date.month > FEBRUARY ? date.month - MARCH : date.month + MONTHS_PER_YEAR - MARCH;
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + date.day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * DAYS_PER_ERA + dayOfEra - DAYS_BEFORE_UNIX_EPOCH_ERA_OFFSET;
}

function civilFromDays(days: number): CivilDate {
  const shifted = days + DAYS_BEFORE_UNIX_EPOCH_ERA_OFFSET;
  const era = Math.floor(shifted / DAYS_PER_ERA);
  const dayOfEra = shifted - era * DAYS_PER_ERA;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1_460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth < 10 ? shiftedMonth + MARCH : shiftedMonth - 9;
  const baseYear = yearOfEra + era * ERA_YEARS;
  return { year: month <= FEBRUARY ? baseYear + 1 : baseYear, month, day };
}

// Soma meses de calendário em UTC mantendo o instante do dia. O dia que não existe no mês de destino
// (31 de janeiro + 1 mês) vai para o último dia dele. Sem `Date`: a data civil sai de aritmética inteira,
// então o resultado não depende do fuso nem do runtime.
export function addUtcMonths(milliseconds: number, months: number): number {
  const days = Math.floor(milliseconds / MILLISECONDS_PER_DAY);
  const millisecondsOfDay = milliseconds - days * MILLISECONDS_PER_DAY;
  const { year, month, day } = civilFromDays(days);
  const totalMonths = year * MONTHS_PER_YEAR + (month - FIRST_MONTH) + months;
  const targetYear = Math.floor(totalMonths / MONTHS_PER_YEAR);
  const targetMonth = totalMonths - targetYear * MONTHS_PER_YEAR + FIRST_MONTH;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return (
    daysFromCivil({ year: targetYear, month: targetMonth, day: targetDay }) * MILLISECONDS_PER_DAY +
    millisecondsOfDay
  );
}
