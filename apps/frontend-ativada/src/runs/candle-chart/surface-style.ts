// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  SurfaceLineRole,
  SurfaceMarker,
  SurfaceProjection,
  SurfaceScoreBar,
  SurfaceThreshold,
  SurfaceTheme,
  SurfaceTime,
  SurfaceVolumeBar,
} from './chart-surface.types.js';
import { withAlpha } from './chart-theme.js';
import type { MarkColors } from './trade-marks-paint.js';

// Decisões de cor, traço e forma do adaptador, sem importar a biblioteca (ele só aplica o que sai daqui).
const VOLUME_ALPHA = 0.45;
const LEVEL_ALPHA = 0.16;
const MARK_BAND_ALPHA = 0.14;
const FORMING_FILL_ALPHA = 0;
const MARKER_SIZE = 2;
const SELECTED_MARKER_SIZE = 3;
const WAITED_MARKER_SIZE = 0.5;

export type LineStyleChoice = { readonly color: string; readonly isDashed: boolean };

export function chooseLineStyle(role: SurfaceLineRole, theme: SurfaceTheme): LineStyleChoice {
  if (role === 'ema_fast') return { color: theme.line, isDashed: false };
  if (role === 'ema_slow') return { color: theme.coneNeutral, isDashed: false };
  if (role === 'band_middle') return { color: theme.coneNeutral, isDashed: true };
  return { color: theme.line, isDashed: true };
}

export type ColoredPoint = {
  readonly time: SurfaceTime;
  readonly value: number;
  readonly color: string;
};

export function buildVolumeData(
  bars: readonly SurfaceVolumeBar[],
  theme: SurfaceTheme,
): ColoredPoint[] {
  return bars.map((bar) => ({
    time: bar.time,
    value: bar.value,
    color: withAlpha(bar.isUp ? theme.up : theme.down, VOLUME_ALPHA),
  }));
}

function colorOfAction(action: SurfaceScoreBar['action'], theme: SurfaceTheme): string {
  if (action === 'BUY') return theme.up;
  return action === 'SELL' ? theme.down : theme.coneNeutral;
}

export function buildScoreData(
  bars: readonly SurfaceScoreBar[],
  theme: SurfaceTheme,
): ColoredPoint[] {
  return bars.map((bar) => ({
    time: bar.time,
    value: bar.value,
    color: colorOfAction(bar.action, theme),
  }));
}

export type ThresholdLine = {
  readonly title: string;
  readonly price: number;
  readonly color: string;
};

// As linhas de compra e de venda do placar valem pelo último trecho de limiar (no walk-forward cada janela tem o seu).
export function buildThresholdLines(
  thresholds: readonly SurfaceThreshold[],
  theme: SurfaceTheme,
): ThresholdLine[] {
  const segment = thresholds.at(-1);
  if (segment === undefined) return [];
  return [
    { title: 'compra', price: segment.buy, color: theme.text },
    { title: 'venda', price: segment.sell, color: theme.text },
  ];
}

export type MarkerSpec = {
  readonly time: SurfaceTime;
  readonly position: 'aboveBar' | 'belowBar' | 'inBar';
  readonly shape: 'arrowUp' | 'arrowDown' | 'circle';
  readonly color: string;
  readonly text: string;
  readonly size: number;
};

function tradeMarkerSpec(marker: SurfaceMarker, theme: SurfaceTheme): MarkerSpec {
  const isBuy = marker.side === 'buy';
  return {
    time: marker.time,
    position: isBuy ? 'belowBar' : 'aboveBar',
    shape: isBuy ? 'arrowUp' : 'arrowDown',
    color: isBuy ? theme.up : theme.down,
    text: '',
    size: marker.isSelected ? SELECTED_MARKER_SIZE : MARKER_SIZE,
  };
}

// Compras e vendas (seta e palavra) e, se a camada estiver ligada, o pontinho discreto de "esperou"; em ordem de tempo.
export function buildMarkerSpecs(
  markers: readonly SurfaceMarker[],
  waited: readonly SurfaceTime[],
  theme: SurfaceTheme,
): MarkerSpec[] {
  const waitedSpecs = waited.map((time): MarkerSpec => ({
    time,
    position: 'inBar',
    shape: 'circle',
    color: theme.text,
    text: '',
    size: WAITED_MARKER_SIZE,
  }));
  const tradeSpecs = markers.map((marker) => tradeMarkerSpec(marker, theme));
  return [...tradeSpecs, ...waitedSpecs].sort((left, right) => left.time - right.time);
}

// Cores das etiquetas de compra e venda: a mesma cor semântica da vela, com faixa suave na vela, halo e texto do fundo do gráfico.
export function buildMarkColors(theme: SurfaceTheme): MarkColors {
  return {
    buy: theme.up,
    sell: theme.down,
    buyBand: withAlpha(theme.up, MARK_BAND_ALPHA),
    sellBand: withAlpha(theme.down, MARK_BAND_ALPHA),
    halo: theme.background,
    onMark: theme.background,
  };
}

export function buildLevelColors(theme: SurfaceTheme): {
  readonly target: string;
  readonly stop: string;
  readonly text: string;
} {
  return {
    target: withAlpha(theme.up, LEVEL_ALPHA),
    stop: withAlpha(theme.down, LEVEL_ALPHA),
    text: theme.text,
  };
}

export function buildCandleColors(theme: SurfaceTheme): {
  readonly upColor: string;
  readonly downColor: string;
  readonly borderUpColor: string;
  readonly borderDownColor: string;
  readonly wickUpColor: string;
  readonly wickDownColor: string;
} {
  return {
    upColor: theme.up,
    downColor: theme.down,
    borderUpColor: theme.up,
    borderDownColor: theme.down,
    wickUpColor: theme.up,
    wickDownColor: theme.down,
  };
}

// Vela em formação: contorno e pavio na cor da direção, sem preenchimento (a biblioteca não tem contorno tracejado).
export function buildFormingColors(theme: SurfaceTheme): ReturnType<typeof buildCandleColors> {
  return {
    ...buildCandleColors(theme),
    upColor: withAlpha(theme.up, FORMING_FILL_ALPHA),
    downColor: withAlpha(theme.down, FORMING_FILL_ALPHA),
  };
}

export type ConeEdge = {
  readonly key: 'upper' | 'lower' | 'base';
  readonly color: string;
  readonly isDashed: boolean;
  readonly points: readonly { readonly time: SurfaceTime; readonly value: number }[];
};

type EdgeSpec = readonly [ConeEdge['key'], string, number, boolean];

// Meio-cone colorido do lado da tendência e a outra metade neutra, mais a linha plana no preço de partida (D10). Nunca
// há preço-alvo: as pontas são a faixa gravada de ±1 ATR.
export function buildConeEdges(projection: SurfaceProjection, theme: SurfaceTheme): ConeEdge[] {
  const { startTime, endTime, base } = projection;
  const isBuy = projection.side === 'buy';
  const specs: readonly EdgeSpec[] = [
    ['upper', isBuy ? theme.coneUp : theme.coneNeutral, projection.high, false],
    ['lower', isBuy ? theme.coneNeutral : theme.coneDown, projection.low, false],
    ['base', theme.coneNeutral, base, true],
  ];
  return specs.map(([key, color, target, isDashed]) => ({
    key,
    color,
    isDashed,
    points: [
      { time: startTime, value: base },
      { time: endTime, value: target },
    ],
  }));
}
