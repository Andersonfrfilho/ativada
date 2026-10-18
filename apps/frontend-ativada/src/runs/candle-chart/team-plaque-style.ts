// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  SurfaceMarker,
  SurfaceTeamPlaque,
  SurfaceTheme,
  SurfaceTime,
} from './chart-surface.types.js';
import { buildMarkerSpecs, type MarkerSpec } from './surface-style.js';

const PLAQUE_SHAPE = { buy: 'arrowUp', sell: 'arrowDown', hold: 'circle' } as const;
const PLAQUE_MARKER_SIZE = 1;

export type MarkerLayers = {
  readonly markers: readonly SurfaceMarker[];
  readonly waited: readonly SurfaceTime[];
  readonly plaques: readonly SurfaceTeamPlaque[];
};

// A plaquinha de uma equipe ◆: na cor do modelo, forma por ação e o texto "◆N ↗ comprar" (ícone + palavra + inicial).
function teamPlaqueSpec(plaque: SurfaceTeamPlaque, theme: SurfaceTheme): MarkerSpec {
  return {
    time: plaque.time,
    position: 'aboveBar',
    shape: PLAQUE_SHAPE[plaque.action],
    color: theme.model ?? theme.line,
    text: plaque.text,
    size: PLAQUE_MARKER_SIZE,
  };
}

// Compras e vendas, o pontinho de "esperou" e as plaquinhas das equipes, tudo numa lista em ordem de tempo.
export function buildAllMarkerSpecs(layers: MarkerLayers, theme: SurfaceTheme): MarkerSpec[] {
  const base = buildMarkerSpecs(layers.markers, layers.waited, theme);
  const plaques = layers.plaques.map((plaque) => teamPlaqueSpec(plaque, theme));
  return [...base, ...plaques].sort((left, right) => left.time - right.time);
}
