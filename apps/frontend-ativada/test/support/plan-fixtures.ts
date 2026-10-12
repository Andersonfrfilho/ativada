// Copyright (c) 2026 Ada Technology. All rights reserved.
import { buildGoal } from './goal-fixtures.js';

export const PLAN_NOW = Date.parse('2026-10-11T12:00:00.000Z');
const DAY = 86_400_000;

type LevelOverrides = Record<string, unknown>;

export function buildPlanLevel(overrides: LevelOverrides = {}): Record<string, unknown> {
  return {
    status: 'price',
    price: '58800',
    trigger: 'at_or_below',
    direction: 'below',
    distance: '1200',
    distanceRate: '0.02',
    ...overrides,
  };
}

export function buildPlanView(
  planOverrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    goal: buildGoal(),
    strategy: { id: 'strategy-1', name: 'Placar clássico', versionId: 'version-1', version: 1 },
    symbol: 'BTCUSDT',
    candlesUsed: 430,
    lastCandleOpenTime: PLAN_NOW - DAY,
    deadline: new Date(PLAN_NOW + 30 * DAY).toISOString(),
    plan: {
      version: 'plan-1',
      lastCloseTime: PLAN_NOW,
      lastClose: '60000',
      basis: 'exact',
      signal: { action: 'HOLD', score: '0.5' },
      buy: buildPlanLevel(),
      exit: buildPlanLevel({
        status: 'unreachable',
        price: null,
        trigger: null,
        direction: null,
        distance: null,
        distanceRate: null,
      }),
      entryReference: '58800',
      target: { rate: '0.03', price: '60564' },
      stop: { rate: '-0.05', price: '55860' },
      startsAt: PLAN_NOW,
      deadlineAt: PLAN_NOW + 30 * DAY,
      horizonDays: 30,
      rules: [],
      ...planOverrides,
    },
  };
}

export function buildDailyCandles(): Record<string, unknown>[] {
  return Array.from({ length: 60 }, (_, index) => {
    const openTime = PLAN_NOW - (60 - index) * DAY;
    const close = String(57_000 + index * 50);
    return {
      openTime,
      closeTime: openTime + DAY - 1,
      open: close,
      high: close,
      low: close,
      close,
      volume: '1',
      tradeCount: 1,
    };
  });
}
