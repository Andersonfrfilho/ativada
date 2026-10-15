// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SurfaceLevelBox } from './chart-surface.types.js';

// Caixas "Stop e alvo" (RF09) desenhadas por um primitivo da série. Este arquivo NÃO importa a biblioteca: os tipos abaixo
// são o subconjunto que ela entrega, e o adaptador (único importador) confere o encaixe no `attachPrimitive`.
export type BoxProjection = {
  readonly timeToX: (seconds: number) => number | null;
  readonly priceToY: (price: number) => number | null;
  readonly paneWidth: () => number;
};

export type BoxColors = { readonly target: string; readonly stop: string; readonly text: string };

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

const LABEL_FONT_PIXELS = 11;
const LABEL_OFFSET_PIXELS = 4;

function fillBand(
  scope: BitmapScope,
  band: readonly [number, number, number, number],
  color: string,
): void {
  const [left, right, from, to] = band;
  const { context, horizontalPixelRatio: horizontal, verticalPixelRatio: vertical } = scope;
  context.fillStyle = color;
  context.fillRect(
    Math.round(left * horizontal),
    Math.round(Math.min(from, to) * vertical),
    Math.max(1, Math.round((right - left) * horizontal)),
    Math.max(1, Math.round(Math.abs(to - from) * vertical)),
  );
}

function writeLabel(scope: BitmapScope, text: string, position: readonly [number, number]): void {
  const { context, horizontalPixelRatio: horizontal, verticalPixelRatio: vertical } = scope;
  context.font = `${Math.round(LABEL_FONT_PIXELS * vertical)}px sans-serif`;
  context.fillText(
    text,
    Math.round((position[0] + LABEL_OFFSET_PIXELS) * horizontal),
    Math.round((position[1] - LABEL_OFFSET_PIXELS) * vertical),
  );
}

export class LevelBoxesPrimitive {
  private boxes: readonly SurfaceLevelBox[] = [];
  private colors: BoxColors | undefined;
  private requestUpdate: (() => void) | undefined;

  constructor(private readonly projection: BoxProjection) {}

  readonly attached = (parameter: { readonly requestUpdate: () => void }): void => {
    this.requestUpdate = parameter.requestUpdate;
  };

  readonly detached = (): void => {
    this.requestUpdate = undefined;
  };

  readonly update = (boxes: readonly SurfaceLevelBox[], colors: BoxColors): void => {
    this.boxes = boxes;
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
    scope.context.fillStyle = colors.text;
    for (const box of this.boxes) this.paintBox(scope, box, colors);
  }

  private paintBox(scope: BitmapScope, box: SurfaceLevelBox, colors: BoxColors): void {
    const { projection } = this;
    const left = projection.timeToX(box.entryTime);
    const right = box.exitTime === null ? projection.paneWidth() : projection.timeToX(box.exitTime);
    const entryY = projection.priceToY(box.entry);
    const targetY = projection.priceToY(box.target);
    const stopY = projection.priceToY(box.stop);
    if (left === null || right === null || entryY === null || targetY === null || stopY === null)
      return;
    fillBand(scope, [left, right, entryY, targetY], colors.target);
    fillBand(scope, [left, right, entryY, stopY], colors.stop);
    scope.context.fillStyle = colors.text;
    writeLabel(scope, 'alvo', [left, targetY]);
    writeLabel(scope, 'stop', [left, stopY]);
  }
}
