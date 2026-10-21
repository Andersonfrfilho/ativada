// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CandleShape } from './market-candles.validation.js';
import type { TrailPoint } from './price-trail.js';
import type { AvailableProjection } from './projections.validation.js';

// O modelo do painel "Próxima vela de perto" (D13): coordenadas de um SVG pequeno, sem biblioteca.
export const PANEL_WIDTH = 320;
export const PANEL_HEIGHT = 210;
export const PANEL_AXIS_WIDTH = 76;
export const PANEL_TOP = 12;
export const PANEL_PLOT_HEIGHT = 170;
export const PAST_CANDLE_COUNT = 5;
export const PANEL_BODY_HALF = 5;

export type PanelCandle = {
  readonly x: number;
  readonly wickTop: number;
  readonly wickBottom: number;
  readonly bodyTop: number;
  readonly bodyHeight: number;
  readonly isUp: boolean;
};

export type PanelCone = {
  readonly neutral: string;
  readonly trend: string;
  readonly side: 'buy' | 'sell';
  readonly lowY: number;
  readonly highY: number;
  readonly arrowX: number;
  readonly arrowY: number;
};

// A vela em formação ampliada: a caixa do que ela já andou, esticada pelo tempo que a vela dura.
export type PanelForming = {
  readonly x: number;
  readonly width: number;
  readonly top: number;
  readonly height: number;
  readonly isUp: boolean;
};

export type PanelModel = {
  readonly split: number;
  readonly right: number;
  readonly bottom: number;
  readonly past: readonly PanelCandle[];
  readonly baseY: number | undefined;
  readonly cone: PanelCone | undefined;
  readonly forming: PanelForming | undefined;
  readonly trail: string | undefined;
  readonly now: { readonly x: number; readonly y: number } | undefined;
};

export type PanelInput = {
  // As últimas velas fechadas, da mais antiga à mais nova.
  readonly recent: readonly CandleShape[];
  readonly forming: CandleShape | undefined;
  readonly trail: readonly TrailPoint[];
  // O período da vela que está se formando, em ms: o eixo do tempo da zona da direita.
  readonly window: { readonly start: number; readonly end: number };
  readonly projection: AvailableProjection | undefined;
};

export type Scale = (price: number) => number;

export type Layout = { readonly split: number; readonly right: number };
