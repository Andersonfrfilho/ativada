// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SurfaceLevelBox } from './chart-surface.types.js';

// Caixas "Stop e alvo" (RF09) desenhadas por um primitivo da série. Este arquivo NÃO importa a biblioteca: os tipos abaixo
// são o subconjunto que ela entrega, e o adaptador (único importador) confere o encaixe no `attachPrimitive`.
export type BoxProjection = {
  readonly timeToX: (seconds: number) => number | null;
  readonly priceToY: (price: number) => number | null;
  readonly paneWidth: () => number;
};

export type BoxColors = {
  readonly target: string;
  readonly stop: string;
  readonly text: string;
  // O contorno das faixas das equipes ◆.
  readonly model?: string;
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

const LABEL_FONT_PIXELS = 11;
const LABEL_OFFSET_PIXELS = 4;
const DASH_PIXELS = 4;

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
    const prefix = box.tag === undefined ? '' : `${box.tag} `;
    writeLabel(scope, `${prefix}alvo`, [left, targetY]);
    writeLabel(scope, `${prefix}${box.tag === undefined ? 'stop' : 'proteção'}`, [left, stopY]);
    if (box.tag !== undefined) this.outline(scope, [left, right, targetY, stopY], entryY);
  }

  // Contorno tracejado na cor do modelo e a linha da entrada: a faixa de uma equipe ◆ não se confunde com a de uma operação.
  private outline(
    scope: BitmapScope,
    band: readonly [number, number, number, number],
    entryY: number,
  ): void {
    const { context, horizontalPixelRatio: horizontal, verticalPixelRatio: vertical } = scope;
    const [left, right, topY, bottomY] = band;
    const color = this.colors?.model;
    if (color === undefined) return;
    context.save();
    context.strokeStyle = color;
    context.setLineDash([DASH_PIXELS * horizontal, DASH_PIXELS * horizontal]);
    context.strokeRect(
      Math.round(left * horizontal),
      Math.round(Math.min(topY, bottomY) * vertical),
      Math.max(1, Math.round((right - left) * horizontal)),
      Math.max(1, Math.round(Math.abs(bottomY - topY) * vertical)),
    );
    context.beginPath();
    context.moveTo(Math.round(left * horizontal), Math.round(entryY * vertical));
    context.lineTo(Math.round(right * horizontal), Math.round(entryY * vertical));
    context.stroke();
    context.restore();
  }
}
