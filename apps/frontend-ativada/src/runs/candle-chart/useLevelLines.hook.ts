// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useMemo } from 'react';

import { useLiveStatusQuery } from '../live-tracking/live-status.query.js';
import type { ChartSurface, SurfacePriceLevel } from './chart-surface.types.js';
import { buildStrategyLevels } from './strategy-levels.js';
import { buildStrategyZones, type StrategyZones } from './strategy-zones.js';

export type LevelLines = {
  readonly levels: readonly SurfacePriceLevel[];
  readonly zones: StrategyZones;
};

export type LevelLinesInput = {
  readonly runId: string;
  // A camada "Níveis" ligada, numa simulação ao vivo.
  readonly isOn: boolean;
};

// Os níveis da estratégia como linhas horizontais rotuladas, da mesma consulta do acompanhamento (nenhuma consulta nova).
export function useLevelLines(
  surface: ChartSurface | undefined,
  { runId, isOn }: LevelLinesInput,
): LevelLines {
  const status = useLiveStatusQuery(runId, isOn).data;
  const levels = useMemo(
    () => (isOn && status !== undefined ? buildStrategyLevels(status) : []),
    [isOn, status],
  );
  const zones = useMemo(
    () =>
      isOn && status !== undefined ? buildStrategyZones(status) : { zones: [], reason: undefined },
    [isOn, status],
  );
  useEffect(() => {
    surface?.setPriceLevels(levels);
  }, [surface, levels]);
  useEffect(() => {
    surface?.setZones(zones.zones);
  }, [surface, zones]);
  return { levels, zones };
}
