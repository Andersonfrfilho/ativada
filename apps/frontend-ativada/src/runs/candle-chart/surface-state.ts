// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  SurfaceCandle,
  SurfaceFormingSlot,
  SurfaceLevelBox,
  SurfaceLine,
  SurfaceMarker,
  SurfacePriceLevel,
  SurfaceProjection,
  SurfaceScoreBar,
  SurfaceThreshold,
  SurfaceTheme,
  SurfaceTime,
  SurfaceVolumeBar,
  SurfaceZone,
} from './chart-surface.types.js';
import { DEFAULT_PRECISION } from './surface-format.js';

// O que o adaptador guarda entre chamadas: cada camada refaz o próprio desenho quando o tema muda.
export type SurfaceState = {
  theme: SurfaceTheme | undefined;
  pricePrecision: number;
  candles: readonly SurfaceCandle[];
  indexByTime: ReadonlyMap<number, number>;
  volume: readonly SurfaceVolumeBar[];
  lines: readonly SurfaceLine[];
  scoreBars: readonly SurfaceScoreBar[];
  thresholds: readonly SurfaceThreshold[];
  markers: readonly SurfaceMarker[];
  waited: readonly SurfaceTime[];
  levels: readonly SurfaceLevelBox[];
  priceLevels: readonly SurfacePriceLevel[];
  zones: readonly SurfaceZone[];
  projection: SurfaceProjection | null;
  live: SurfaceCandle | null;
  formingSlot: SurfaceFormingSlot | null;
  runStart: SurfaceTime | null;
};

export function createSurfaceState(): SurfaceState {
  return {
    theme: undefined,
    pricePrecision: DEFAULT_PRECISION,
    candles: [],
    indexByTime: new Map(),
    volume: [],
    lines: [],
    scoreBars: [],
    thresholds: [],
    markers: [],
    waited: [],
    levels: [],
    priceLevels: [],
    zones: [],
    projection: null,
    live: null,
    formingSlot: null,
    runStart: null,
  };
}
