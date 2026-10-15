// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState } from 'react';

import type { ChartLayer } from './candle-chart.constant.js';
import {
  readChartPreferences,
  writeChartPreferences,
  type ChartPreferences,
} from './chart-preferences.js';

export type ChartPreferenceControls = {
  readonly preferences: ChartPreferences;
  // `null` volta para a vela da própria execução.
  readonly setTimeframe: (timeframe: ChartPreferences['timeframe']) => void;
  readonly toggleLayer: (layer: ChartLayer) => void;
};

// A vela e as camadas escolhidas ficam neste navegador (preferência de tela, RF10); sem armazenamento valem só na sessão.
export function useChartPreferences(): ChartPreferenceControls {
  const [preferences, setPreferences] = useState<ChartPreferences>(() => readChartPreferences());
  function save(next: ChartPreferences): void {
    setPreferences(next);
    writeChartPreferences(next);
  }
  return {
    preferences,
    setTimeframe: (timeframe): void => save({ ...preferences, timeframe }),
    toggleLayer: (layer): void =>
      save({
        ...preferences,
        layers: { ...preferences.layers, [layer]: !preferences.layers[layer] },
      }),
  };
}
