// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { CHART_PREFERENCES_STORAGE_KEY } from '../src/runs/candle-chart/candle-chart.constant.js';
import {
  DEFAULT_CHART_PREFERENCES,
  readChartPreferences,
  writeChartPreferences,
  type PreferenceStorage,
} from '../src/runs/candle-chart/chart-preferences.js';

function memoryStorage(
  initial?: string,
): PreferenceStorage & { readonly saved: () => string | null } {
  let stored: string | null = initial ?? null;
  return {
    getItem: (): string | null => stored,
    setItem: (_key: string, value: string): void => {
      stored = value;
    },
    saved: (): string | null => stored,
  };
}

const THROWING_STORAGE: PreferenceStorage = {
  getItem: (): string | null => {
    throw new Error('SecurityError');
  },
  setItem: (): void => {
    throw new Error('QuotaExceededError');
  },
};

describe('chart preferences', () => {
  test('the defaults: stop and target and "esperou" off, the rest on', () => {
    expect(readChartPreferences(memoryStorage())).toStrictEqual({
      layers: {
        forecast: true,
        trades: true,
        strategyLines: true,
        stopTarget: false,
        levels: true,
        waited: false,
        teams: false,
      },
      isTooltipOn: true,
    });
    expect(DEFAULT_CHART_PREFERENCES.layers.stopTarget).toBe(false);
    expect(DEFAULT_CHART_PREFERENCES.layers.teams).toBe(false);
  });

  test('what was saved is what comes back', () => {
    const storage = memoryStorage();
    const chosen = {
      layers: { ...DEFAULT_CHART_PREFERENCES.layers, stopTarget: true, forecast: false },
      isTooltipOn: false,
    } as const;
    writeChartPreferences(chosen, storage);
    expect(readChartPreferences(storage)).toStrictEqual(chosen);
    expect(storage.saved()).toBe(JSON.stringify(chosen));
  });

  test('broken or foreign JSON falls back to the default', () => {
    for (const text of ['not json', '"x"', 'null', '[]', '42', '{']) {
      expect(readChartPreferences(memoryStorage(text)), text).toStrictEqual(
        DEFAULT_CHART_PREFERENCES,
      );
    }
  });

  test('an invalid field falls back alone; the valid ones are kept', () => {
    const stored = JSON.stringify({
      layers: { forecast: 'yes', stopTarget: true, waited: 1 },
    });
    expect(readChartPreferences(memoryStorage(stored))).toStrictEqual({
      layers: {
        forecast: true,
        trades: true,
        strategyLines: true,
        stopTarget: true,
        levels: true,
        waited: false,
        teams: false,
      },
      isTooltipOn: true,
    });
  });

  test('a candle size saved by an older version is ignored: every run opens on its own candle', () => {
    const stored = JSON.stringify({ layers: DEFAULT_CHART_PREFERENCES.layers, timeframe: '4h' });
    expect(readChartPreferences(memoryStorage(stored))).toStrictEqual(DEFAULT_CHART_PREFERENCES);
  });

  test('layers that are not an object fall back to the default layers', () => {
    const stored = JSON.stringify({ layers: 'all' });
    const read = readChartPreferences(memoryStorage(stored));
    expect(read.layers).toStrictEqual(DEFAULT_CHART_PREFERENCES.layers);
  });

  test('storage that throws never breaks the screen', () => {
    expect(readChartPreferences(THROWING_STORAGE)).toStrictEqual(DEFAULT_CHART_PREFERENCES);
    expect(() => writeChartPreferences(DEFAULT_CHART_PREFERENCES, THROWING_STORAGE)).not.toThrow();
  });

  test('writes under one key of its own', () => {
    const keys: string[] = [];
    const storage: PreferenceStorage = {
      getItem: (key) => {
        keys.push(key);
        return null;
      },
      setItem: (key) => void keys.push(key),
    };
    writeChartPreferences(DEFAULT_CHART_PREFERENCES, storage);
    readChartPreferences(storage);
    expect(new Set(keys)).toStrictEqual(new Set([CHART_PREFERENCES_STORAGE_KEY]));
  });
});
