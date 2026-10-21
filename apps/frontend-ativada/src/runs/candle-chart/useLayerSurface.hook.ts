// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, useEffectEvent } from 'react';

import type { TradeChart } from '../trade-chart.validation.js';
import { CHART_LAYER, type ChartLayer } from './candle-chart.constant.js';
import type { ChartSurface, SurfaceLevelBox, SurfaceTeamPlaque } from './chart-surface.types.js';
import type { DisplayMapping } from './display-mapping.js';
import { toLevelBoxes, toWaitedTimes } from './layer-series.js';
import { toSurfaceProjection } from './projection-cone.js';
import { toScoreBars, toThresholdSegments } from './score-series.js';
import { toSurfaceLines } from './strategy-line-series.js';
import type { ChartLayerData } from './useChartLayers.hook.js';

export type LayerSurfaceInput = {
  readonly data: ChartLayerData;
  readonly decisions: TradeChart['decisions'];
  readonly isOn: (layer: ChartLayer) => boolean;
  readonly displayMapping: DisplayMapping | undefined;
};

// Empurra as camadas para a superfície. Camada desligada, ou fora da vela da execução, entrega lista vazia: a superfície
// apaga o que desenhou. O placar não tem botão (é parte das camadas da estratégia) e some junto com elas.
export function useLayerSurface(surface: ChartSurface | undefined, input: LayerSurfaceInput): void {
  const { data, decisions, isOn, displayMapping } = input;
  const { layers, projection, trades } = data;
  const isLinesOn = isOn(CHART_LAYER.STRATEGY_LINES);
  const isForecastOn = isOn(CHART_LAYER.FORECAST) && data.isStrategyTimeframe;
  const isWaitedOn = isOn(CHART_LAYER.WAITED) && data.isStrategyTimeframe;
  const isLevelsOn = isOn(CHART_LAYER.STOP_TARGET);
  useEffect(() => {
    surface?.setLines(isLinesOn && layers !== undefined ? toSurfaceLines(layers) : []);
  }, [surface, layers, isLinesOn]);
  useEffect(() => {
    if (layers === undefined) surface?.setScore([], []);
    else surface?.setScore(toScoreBars(layers), toThresholdSegments(layers));
  }, [surface, layers]);
  useEffect(() => {
    surface?.setProjection(
      isForecastOn && projection !== undefined ? toSurfaceProjection(projection) : null,
    );
  }, [surface, projection, isForecastOn]);
  useEffect(() => {
    surface?.setWaited(isWaitedOn ? toWaitedTimes(decisions, displayMapping) : []);
  }, [surface, decisions, isWaitedOn, displayMapping]);
  const isTeamsOn = isOn(CHART_LAYER.TEAMS) && data.isStrategyTimeframe;
  const teamBoxes = isTeamsOn ? (data.team?.boxes ?? NO_BOXES) : NO_BOXES;
  const pushLevels = useEffectEvent((): void => {
    surface?.setLevels([...(isLevelsOn ? toLevelBoxes(trades) : []), ...teamBoxes]);
  });
  const tradesSignature = trades.map((trade) => `${trade.engineKey}:${trade.status}`).join(',');
  const teamSignature = teamBoxes.map((box) => `${box.key}:${box.exitTime}`).join(',');
  useEffect(() => {
    pushLevels();
  }, [surface, isLevelsOn, tradesSignature, teamSignature]);
  useTeamPlaques(surface, isTeamsOn ? data.team?.plaques : undefined);
}

const NO_BOXES: readonly SurfaceLevelBox[] = [];

// As plaquinhas das equipes ◆: camada desligada ou sem dados entrega lista vazia e a superfície apaga o que desenhou.
function useTeamPlaques(
  surface: ChartSurface | undefined,
  plaques: readonly SurfaceTeamPlaque[] | undefined,
): void {
  useEffect(() => {
    surface?.setTeamPlaques(plaques ?? []);
  }, [surface, plaques]);
}
