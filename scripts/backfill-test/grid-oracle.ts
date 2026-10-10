// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  CLOCK_SAFETY_MARGIN,
  DURATION_MILLISECONDS,
  MILLISECONDS_PER_HOUR,
  type BackfillTimeframe,
} from './backfill-test.constant.js';

export type GridWindow = {
  readonly from: number;
  readonly to: number;
  readonly count: number;
};

// Oráculo independente do cron: os anos voltam pelo calendário UTC, a grade é a do epoch.
export function computeGridWindow(params: {
  readonly now: number;
  readonly years: number;
  readonly timeframe: BackfillTimeframe;
}): GridWindow {
  const duration = DURATION_MILLISECONDS[params.timeframe];
  const start = new Date(params.now);
  start.setUTCFullYear(start.getUTCFullYear() - params.years);
  const from = Math.ceil(start.getTime() / duration) * duration;
  const to = Math.floor(params.now / duration) * duration;
  return { from, to, count: Math.max(0, (to - from) / duration) };
}

export function pagesFor(count: number, pageSize: number): number {
  return Math.ceil(count / pageSize);
}

// A janela do cron vira com a hora; não começar um cenário perto da virada evita um falso vermelho.
export async function waitForSafeClock(): Promise<void> {
  const intoHour = Date.now() % MILLISECONDS_PER_HOUR;
  const isTooEarly = intoHour < CLOCK_SAFETY_MARGIN.AFTER_BOUNDARY_MILLISECONDS;
  const isTooLate =
    intoHour > MILLISECONDS_PER_HOUR - CLOCK_SAFETY_MARGIN.BEFORE_BOUNDARY_MILLISECONDS;
  if (!isTooEarly && !isTooLate) return;
  const untilSafe = isTooLate
    ? MILLISECONDS_PER_HOUR - intoHour + CLOCK_SAFETY_MARGIN.AFTER_BOUNDARY_MILLISECONDS
    : CLOCK_SAFETY_MARGIN.AFTER_BOUNDARY_MILLISECONDS - intoHour;
  await Bun.sleep(untilSafe);
}
