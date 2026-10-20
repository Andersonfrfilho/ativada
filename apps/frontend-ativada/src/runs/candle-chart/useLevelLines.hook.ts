// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useMemo } from 'react';

import { useLiveStatusQuery } from '../live-tracking/live-status.query.js';
import { useTradePlanQuery } from '../trading-room/trade-plan.query.js';
import type { ChartSurface, SurfacePriceLevel } from './chart-surface.types.js';
import { buildPlanLevels } from './plan-levels.js';
import { buildStrategyLevels } from './strategy-levels.js';
import { buildStrategyZones, type StrategyZones } from './strategy-zones.js';
import { usePointedLevel } from './pointed-level.context.js';
import { useIsTerminalChart } from './terminal-chart.context.js';

export type LevelLines = {
  readonly levels: readonly SurfacePriceLevel[];
  readonly zones: StrategyZones;
};

export type LevelLinesInput = {
  readonly runId: string;
  // A camada "Níveis" ligada, numa simulação ao vivo.
  readonly isOn: boolean;
};

// Os níveis da estratégia como linhas horizontais rotuladas, da mesma consulta do acompanhamento; no telão, do plano do
// servidor (compra simulada, alvo e proteção), com o nível antigo como reserva quando não há plano.
export function useLevelLines(
  surface: ChartSurface | undefined,
  { runId, isOn }: LevelLinesInput,
): LevelLines {
  const status = useLiveStatusQuery(runId, isOn).data;
  const isTerminal = useIsTerminalChart();
  const plan = useTradePlanQuery(runId, isOn && isTerminal).data?.plan;
  const pointed = usePointedLevel().role;
  const levels = useMemo(() => {
    if (!isOn || status === undefined) return [];
    const built = buildPlanLevels(isTerminal ? plan : undefined) ?? buildStrategyLevels(status);
    return built.map((level) => ({ ...level, isPointed: level.role === pointed }));
  }, [isOn, status, plan, isTerminal, pointed]);
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
