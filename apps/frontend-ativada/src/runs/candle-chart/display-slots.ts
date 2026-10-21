// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parseScaled } from '../../format/decimal.js';
import type { StreamCandle } from '../../live/stream.validation.js';
import { slotCount, type DisplayMapping } from './display-mapping.js';
import type { MarketCandle } from './market-candles.validation.js';

// As vagas de 3 min da vela de 15 min em formação (spec 017, RF07): fechadas, a em formação, as que faltam.
export type SlotState = 'closed' | 'forming' | 'arriving' | 'missing' | 'pending';

// A vela fechou há pouco e o worker ainda a está gravando: "chegando" antes de virar "sem dado".
const ARRIVAL_MILLISECONDS = 60_000;

export type SlotDirection = 'up' | 'down' | 'flat';

export type DisplaySlot = {
  readonly openTime: number;
  readonly state: SlotState;
  // O fechamento (texto decimal) quando a vela existe.
  readonly close: string | undefined;
  readonly direction: SlotDirection | undefined;
  // Vela fechada sem negócio: carrega o fechamento anterior e não mexe na máxima nem na mínima (ADR 0002, V9).
  readonly hasNoTrades: boolean;
};

export type SlotsParams = {
  readonly start: number;
  readonly mapping: DisplayMapping;
  readonly closed: readonly MarketCandle[];
  readonly forming: StreamCandle | undefined;
  readonly now: number;
};

function directionOf(open: string, close: string): SlotDirection | undefined {
  const opened = parseScaled(open);
  const closedAt = parseScaled(close);
  if (opened === undefined || closedAt === undefined) return undefined;
  if (closedAt === opened) return 'flat';
  return closedAt > opened ? 'up' : 'down';
}

function slotAt(openTime: number, params: SlotsParams): DisplaySlot {
  const { forming, closed, mapping, now } = params;
  if (forming?.openTime === openTime) {
    const { close } = forming;
    return {
      openTime,
      state: 'forming',
      close,
      direction: directionOf(forming.open, close),
      hasNoTrades: false,
    };
  }
  const candle = closed.find((item) => item.openTime === openTime);
  if (candle !== undefined) {
    const direction = directionOf(candle.open, candle.close);
    return {
      openTime,
      state: 'closed',
      close: candle.close,
      direction,
      hasNoTrades: candle.tradeCount === 0,
    };
  }
  const closedAt = openTime + mapping.displayMilliseconds;
  const overState: SlotState = now - closedAt < ARRIVAL_MILLISECONDS ? 'arriving' : 'missing';
  return {
    openTime,
    state: closedAt <= now ? overState : 'pending',
    close: undefined,
    direction: undefined,
    hasNoTrades: false,
  };
}

export function buildSlots(params: SlotsParams): DisplaySlot[] {
  const { start, mapping } = params;
  return Array.from({ length: slotCount(mapping) }, (_unused, index) =>
    slotAt(start + index * mapping.displayMilliseconds, params),
  );
}
