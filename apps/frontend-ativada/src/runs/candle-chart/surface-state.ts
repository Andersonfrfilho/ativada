// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  SurfaceCandle,
  SurfaceLevelBox,
  SurfaceLine,
  SurfaceMarker,
  SurfaceProjection,
  SurfaceScoreBar,
  SurfaceThreshold,
  SurfaceTheme,
  SurfaceTime,
  SurfaceVolumeBar,
} from './chart-surface.types.js';

// O que o adaptador guarda entre chamadas: cada camada refaz o próprio desenho quando o tema muda.
export type SurfaceState = {
  theme: SurfaceTheme | undefined;
  candles: readonly SurfaceCandle[];
  indexByTime: ReadonlyMap<number, number>;
  volume: readonly SurfaceVolumeBar[];
  lines: readonly SurfaceLine[];
  scoreBars: readonly SurfaceScoreBar[];
  thresholds: readonly SurfaceThreshold[];
  markers: readonly SurfaceMarker[];
  waited: readonly SurfaceTime[];
  levels: readonly SurfaceLevelBox[];
  projection: SurfaceProjection | null;
  live: SurfaceCandle | null;
};

export function createSurfaceState(): SurfaceState {
  return {
    theme: undefined,
    candles: [],
    indexByTime: new Map(),
    volume: [],
    lines: [],
    scoreBars: [],
    thresholds: [],
    markers: [],
    waited: [],
    levels: [],
    projection: null,
    live: null,
  };
}
