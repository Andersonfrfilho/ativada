// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  liveStatusSchema,
  type LiveStatus,
} from '../src/runs/live-tracking/live-status.validation.js';
import { describeScore } from '../src/runs/trading-room/room-score.js';
import { buildRoomLiveStatus } from './support/team-room-fixtures.js';

function triggersOf(overrides: Record<string, unknown>): LiveStatus['triggers'] {
  const status = buildRoomLiveStatus([]);
  const triggers = status['triggers'] as Record<string, unknown>;
  return liveStatusSchema.parse({ ...status, triggers: { ...triggers, ...overrides } }).triggers;
}

describe('describeScore', () => {
  test('awaiting entry: the buy threshold, with sign', () => {
    expect(
      describeScore(triggersOf({ state: 'awaiting_entry', score: '1', scoreThreshold: '2' })),
    ).toBe('placar +1 · compra a partir de +2');
  });

  test('holding: the sell threshold is negative whatever sign the server sends, never "+4 de −2"', () => {
    for (const threshold of ['-2', '2']) {
      expect(
        describeScore(triggersOf({ state: 'holding', score: '4', scoreThreshold: threshold })),
      ).toBe('placar +4 · vende a partir de −2');
    }
  });

  test('a negative score and fractions use the minus sign and pt-BR comma', () => {
    expect(
      describeScore(triggersOf({ state: 'holding', score: '-0.5', scoreThreshold: '-2.5' })),
    ).toBe('placar −0,5 · vende a partir de −2,5');
  });

  test('without triggers there is no phrase', () => {
    expect(
      describeScore(triggersOf({ status: 'unavailable', reason: 'no_candle', message: 'x' })),
    ).toBeUndefined();
  });
});
