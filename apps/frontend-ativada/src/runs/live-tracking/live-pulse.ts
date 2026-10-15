// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Decision } from './live-status.validation.js';

const MILLISECONDS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const TWO_DIGITS = 2;

export const OUTCOME_WORD: Readonly<Record<Decision['outcome'], string>> = {
  waited: 'esperou',
  bought: 'comprou',
  buy_pending: 'pediu compra',
  sold: 'vendeu',
  exited: 'saiu',
};

function pad(value: number): string {
  return String(value).padStart(TWO_DIGITS, '0');
}

// "23:12" (minutos e segundos) ou "1:05:09" quando falta uma hora ou mais; nunca negativo.
export function formatCountdown(remainingMilliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMilliseconds / MILLISECONDS_PER_SECOND));
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  const totalMinutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

// "há 3 s", "há 2 min" ou "há 1 h": a idade do último sinal que o painel recebeu.
export function formatAge(ageMilliseconds: number): string {
  const seconds = Math.max(0, Math.floor(ageMilliseconds / MILLISECONDS_PER_SECOND));
  if (seconds < SECONDS_PER_MINUTE) return `há ${seconds} s`;
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  if (minutes < MINUTES_PER_HOUR) return `há ${minutes} min`;
  return `há ${Math.floor(minutes / MINUTES_PER_HOUR)} h`;
}
