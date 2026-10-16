// Copyright (c) 2026 Ada Technology. All rights reserved.
const MILLISECONDS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MAX_HOURS_SHOWN = 48;

// "menos de 1 min", "35 min", "16 h" ou "3 dias": há quanto tempo a simulação roda, sem segundos.
export function formatRunningFor(elapsedMilliseconds: number): string {
  const minutes = Math.floor(Math.max(0, elapsedMilliseconds) / MILLISECONDS_PER_MINUTE);
  if (minutes < 1) return 'menos de 1 min';
  if (minutes < MINUTES_PER_HOUR) return `${minutes} min`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < MAX_HOURS_SHOWN) return `${hours} h`;
  return `${Math.floor(hours / HOURS_PER_DAY)} dias`;
}

const CANDLE_SHORT_LABEL: Readonly<Record<string, string>> = {
  '15m': '15 min',
  '1h': '1 h',
  '4h': '4 h',
  '1d': '1 dia',
};

export function describeCandle(timeframe: string): string {
  return `vela de ${CANDLE_SHORT_LABEL[timeframe] ?? timeframe}`;
}
