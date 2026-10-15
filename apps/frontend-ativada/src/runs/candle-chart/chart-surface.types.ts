// Copyright (c) 2026 Ada Technology. All rights reserved.

// Porta do gráfico de velas (spec 009, plan D1): o React só fala com ela. O adaptador real (`lightweight-surface.ts`,
// T3.1) é o ÚNICO arquivo que importa `lightweight-charts`; os contratos usam a superfície falsa de `test/support/`,
// porque o happy-dom não tem canvas. Tempo em segundos UTC e preço em `number`: só coordenada de desenho (RNF03).

export type SurfaceTime = number;

export type SurfaceCandle = {
  readonly time: SurfaceTime;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
};

export type SurfaceVolumeBar = {
  readonly time: SurfaceTime;
  readonly value: number;
  readonly isUp: boolean;
};

export type SurfaceLineRole =
  | 'channel_upper'
  | 'channel_lower'
  | 'ema_fast'
  | 'ema_slow'
  | 'band_upper'
  | 'band_middle'
  | 'band_lower';

export type SurfaceLine = {
  readonly key: string;
  readonly role: SurfaceLineRole;
  readonly points: readonly { readonly time: SurfaceTime; readonly value: number }[];
};

export type SurfaceScoreBar = {
  readonly time: SurfaceTime;
  readonly value: number;
  readonly action: 'BUY' | 'SELL' | 'HOLD';
};

export type SurfaceThreshold = {
  readonly from: SurfaceTime;
  readonly to: SurfaceTime;
  readonly buy: number;
  readonly sell: number;
};

export type SurfaceMarker = {
  readonly key: string;
  readonly time: SurfaceTime;
  readonly side: 'buy' | 'sell';
  readonly label: string;
  readonly isSelected: boolean;
};

// Caixas "Stop e alvo": da entrada ao alvo e da entrada ao stop; `exitTime` nulo = posição aberta (vai até a ponta).
export type SurfaceLevelBox = {
  readonly key: string;
  readonly entryTime: SurfaceTime;
  readonly exitTime: SurfaceTime | null;
  readonly entry: number;
  readonly stop: number;
  readonly target: number;
};

// Rótulos do eixo e da dica no fuso do usuário: a biblioteca desenha em UTC e só chama estas funções (segundos UTC).
export type SurfaceTimeLabels = {
  readonly time: (seconds: SurfaceTime) => string;
  readonly day: (seconds: SurfaceTime) => string;
  readonly full: (seconds: SurfaceTime) => string;
};

export type SurfaceProjection = {
  readonly startTime: SurfaceTime;
  readonly endTime: SurfaceTime;
  readonly base: number;
  readonly low: number;
  readonly high: number;
  readonly side: 'buy' | 'sell';
};

// Cores já resolvidas dos tokens de `global.css` (lidas por `getComputedStyle` num só lugar).
export type SurfaceTheme = {
  readonly background: string;
  readonly text: string;
  readonly grid: string;
  readonly up: string;
  readonly down: string;
  readonly line: string;
  readonly coneUp: string;
  readonly coneDown: string;
  readonly coneNeutral: string;
};

export type SurfaceLogicalRange = { readonly from: number; readonly to: number };

export type ChartSurface = {
  readonly setCandles: (candles: readonly SurfaceCandle[]) => void;
  readonly setVolume: (bars: readonly SurfaceVolumeBar[]) => void;
  readonly setLines: (lines: readonly SurfaceLine[]) => void;
  readonly setScore: (
    bars: readonly SurfaceScoreBar[],
    thresholds: readonly SurfaceThreshold[],
  ) => void;
  readonly setMarkers: (markers: readonly SurfaceMarker[]) => void;
  readonly setLevels: (boxes: readonly SurfaceLevelBox[]) => void;
  // Pontinhos discretos de "esperou" (camada desligada por padrão).
  readonly setWaited: (times: readonly SurfaceTime[]) => void;
  readonly setProjection: (projection: SurfaceProjection | null) => void;
  readonly setLiveCandle: (candle: SurfaceCandle | null) => void;
  readonly setCrosshair: (index: number | null) => void;
  readonly onCrosshairMove: (listener: (index: number | null) => void) => () => void;
  readonly onVisibleRangeChange: (listener: (range: SurfaceLogicalRange) => void) => () => void;
  readonly setTheme: (theme: SurfaceTheme) => void;
  readonly setTimeLabels: (labels: SurfaceTimeLabels) => void;
  readonly onClick: (listener: (index: number | null) => void) => () => void;
  // Mantém a largura visível (em velas) e põe o instante no centro; usado ao trocar a vela do gráfico.
  readonly centerOn: (time: SurfaceTime) => void;
  readonly zoom: (step: number) => void;
  readonly fit: () => void;
  // Mostra só as últimas N velas, com a ponta direita à vista (abertura padrão quando o gráfico acompanha o fim).
  readonly showLast: (bars: number) => void;
  readonly scrollToEnd: () => void;
  readonly destroy: () => void;
};

export type ChartSurfaceFactory = (container: HTMLElement) => ChartSurface;
