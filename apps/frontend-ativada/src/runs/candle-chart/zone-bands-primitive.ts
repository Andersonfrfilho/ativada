// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SurfaceZone } from './chart-surface.types.js';

// Faixas de preço (compra, venda, proteção) desenhadas atrás das velas por um primitivo da série. Este arquivo NÃO importa a
// biblioteca: a projeção entra pelo construtor, como nas caixas de "Stop e alvo".
export type ZoneProjection = {
  readonly priceToY: (price: number) => number | null;
  readonly paneWidth: () => number;
};

export type ZoneColors = {
  readonly buy: string;
  readonly sell: string;
  readonly protection: string;
  readonly text: string;
};

type BitmapScope = {
  readonly context: CanvasRenderingContext2D;
  readonly horizontalPixelRatio: number;
  readonly verticalPixelRatio: number;
};

type DrawTarget = {
  readonly useBitmapCoordinateSpace: (draw: (scope: BitmapScope) => void) => void;
};

type PaneView = {
  readonly zOrder: () => 'bottom';
  readonly renderer: () => { readonly draw: (target: DrawTarget) => void };
};

const FILL_ALPHA = 0.16;
const LABEL_FONT_PIXELS = 11;
const LABEL_OFFSET_PIXELS = 6;
const DASH_PIXELS = 5;

// A proteção escreve na borda de baixo e as outras na de cima, para os rótulos não se sobreporem na linha da entrada.
function labelBaseline(
  zone: SurfaceZone,
  band: { readonly top: number; readonly height: number },
  vertical: number,
): number {
  if (zone.kind === 'protection') return band.top + band.height - Math.round(4 * vertical);
  return band.top + Math.round((LABEL_FONT_PIXELS + 2) * vertical);
}

export class ZoneBandsPrimitive {
  private zones: readonly SurfaceZone[] = [];
  private colors: ZoneColors | undefined;
  private requestUpdate: (() => void) | undefined;

  constructor(private readonly projection: ZoneProjection) {}

  readonly attached = (parameter: { readonly requestUpdate: () => void }): void => {
    this.requestUpdate = parameter.requestUpdate;
  };

  readonly detached = (): void => {
    this.requestUpdate = undefined;
  };

  readonly update = (zones: readonly SurfaceZone[], colors: ZoneColors): void => {
    this.zones = zones;
    this.colors = colors;
    this.requestUpdate?.();
  };

  readonly paneViews = (): readonly PaneView[] => [
    {
      zOrder: () => 'bottom',
      renderer: () => ({
        draw: (target) => target.useBitmapCoordinateSpace((scope) => this.paint(scope)),
      }),
    },
  ];

  private paint(scope: BitmapScope): void {
    const { colors } = this;
    if (colors === undefined) return;
    for (const zone of this.zones) this.paintZone(scope, zone, colors);
  }

  private paintZone(scope: BitmapScope, zone: SurfaceZone, colors: ZoneColors): void {
    const { context, horizontalPixelRatio: horizontal, verticalPixelRatio: vertical } = scope;
    const highY = this.projection.priceToY(zone.high);
    const lowY = this.projection.priceToY(zone.low);
    if (highY === null || lowY === null) return;
    const left = 0;
    const width = Math.round(this.projection.paneWidth() * horizontal);
    const top = Math.round(Math.min(highY, lowY) * vertical);
    const height = Math.max(1, Math.round(Math.abs(lowY - highY) * vertical));
    context.save();
    context.fillStyle = colors[zone.kind];
    context.globalAlpha = FILL_ALPHA;
    context.fillRect(left, top, width, height);
    context.globalAlpha = 1;
    context.strokeStyle = colors[zone.kind];
    context.setLineDash([DASH_PIXELS * horizontal, DASH_PIXELS * horizontal]);
    context.strokeRect(left, top, width, height);
    context.setLineDash([]);
    context.fillStyle = colors.text;
    context.font = `${Math.round(LABEL_FONT_PIXELS * vertical)}px sans-serif`;
    context.fillText(
      zone.label,
      Math.round(LABEL_OFFSET_PIXELS * horizontal),
      labelBaseline(zone, { top, height }, vertical),
    );
    context.restore();
  }
}
