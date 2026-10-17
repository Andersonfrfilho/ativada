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
  readonly toggleLayer: (layer: ChartLayer) => void;
  readonly toggleTooltip: () => void;
};

// As camadas escolhidas ficam neste navegador (preferência de tela, RF10); sem armazenamento valem só na sessão.
export function useChartPreferences(): ChartPreferenceControls {
  const [preferences, setPreferences] = useState<ChartPreferences>(() => readChartPreferences());
  function save(next: ChartPreferences): void {
    setPreferences(next);
    writeChartPreferences(next);
  }
  return {
    preferences,
    toggleTooltip: (): void => save({ ...preferences, isTooltipOn: !preferences.isTooltipOn }),
    toggleLayer: (layer): void =>
      save({
        ...preferences,
        layers: { ...preferences.layers, [layer]: !preferences.layers[layer] },
      }),
  };
}
