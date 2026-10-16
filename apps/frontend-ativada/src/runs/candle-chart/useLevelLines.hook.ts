// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useMemo } from 'react';

import { useLiveStatusQuery } from '../live-tracking/live-status.query.js';
import type { ChartSurface, SurfacePriceLevel } from './chart-surface.types.js';
import { buildStrategyLevels } from './strategy-levels.js';

export type LevelLinesInput = {
  readonly runId: string;
  // A camada "Níveis" ligada, numa simulação ao vivo.
  readonly isOn: boolean;
};

// Os níveis da estratégia como linhas horizontais rotuladas, da mesma consulta do acompanhamento (nenhuma consulta nova).
export function useLevelLines(
  surface: ChartSurface | undefined,
  { runId, isOn }: LevelLinesInput,
): readonly SurfacePriceLevel[] {
  const status = useLiveStatusQuery(runId, isOn).data;
  const levels = useMemo(
    () => (isOn && status !== undefined ? buildStrategyLevels(status) : []),
    [isOn, status],
  );
  useEffect(() => {
    surface?.setPriceLevels(levels);
  }, [surface, levels]);
  return levels;
}
