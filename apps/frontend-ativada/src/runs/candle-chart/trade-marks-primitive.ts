// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SurfaceMarker } from './chart-surface.types.js';
import type { BoxProjection } from './level-boxes-primitive.js';
import {
  groupMarks,
  paintBands,
  paintBrackets,
  paintDots,
  paintPill,
  type MarkColors,
  type MarkPlacement,
} from './trade-marks-paint.js';

type BitmapScope = {
  readonly context: CanvasRenderingContext2D;
  readonly horizontalPixelRatio: number;
  readonly verticalPixelRatio: number;
  readonly bitmapSize: { readonly width: number; readonly height: number };
};

type DrawTarget = {
  readonly useBitmapCoordinateSpace: (draw: (scope: BitmapScope) => void) => void;
};

type PaneView = {
  readonly zOrder: () => 'bottom' | 'top';
  readonly renderer: () => { readonly draw: (target: DrawTarget) => void };
};

// Compras e vendas por cima das velas: o mesmo primitivo desenha a faixa (atrás das velas) e o ponto com a etiqueta (na frente).
// Este arquivo NÃO importa a biblioteca; o adaptador confere o encaixe no `attachPrimitive`.
export class TradeMarksPrimitive {
  private marks: readonly SurfaceMarker[] = [];
  private colors: MarkColors | undefined;
  private requestUpdate: (() => void) | undefined;

  constructor(private readonly projection: BoxProjection) {}

  readonly attached = (parameter: { readonly requestUpdate: () => void }): void => {
    this.requestUpdate = parameter.requestUpdate;
  };

  readonly detached = (): void => {
    this.requestUpdate = undefined;
  };

  readonly update = (marks: readonly SurfaceMarker[], colors: MarkColors): void => {
    this.marks = marks;
    this.colors = colors;
    this.requestUpdate?.();
  };

  readonly paneViews = (): readonly PaneView[] => [this.view('bottom'), this.view('top')];

  private view(order: 'bottom' | 'top'): PaneView {
    return {
      zOrder: () => order,
      renderer: () => ({
        draw: (target) => target.useBitmapCoordinateSpace((scope) => this.paint(scope, order)),
      }),
    };
  }

  private place(): MarkPlacement[] {
    const { projection } = this;
    return this.marks.flatMap((mark) => {
      const x = projection.timeToX(mark.time);
      const y = projection.priceToY(mark.price);
      const endX = mark.endTime === undefined ? undefined : projection.timeToX(mark.endTime);
      return x === null || y === null ? [] : [{ mark, x, y, endX: endX ?? undefined }];
    });
  }

  private paint(scope: BitmapScope, order: 'bottom' | 'top'): void {
    const { colors } = this;
    if (colors === undefined || this.marks.length === 0) return;
    const { context, horizontalPixelRatio: horizontal, verticalPixelRatio: vertical } = scope;
    const frame = {
      width: scope.bitmapSize.width / horizontal,
      height: scope.bitmapSize.height / vertical,
    };
    const placements = this.place();
    context.save();
    context.scale(horizontal, vertical);
    if (order === 'bottom') paintBands(context, placements, { colors, frame });
    else this.paintFront(context, placements, { colors, frame });
    context.restore();
  }

  private paintFront(
    context: CanvasRenderingContext2D,
    placements: readonly MarkPlacement[],
    options: { readonly colors: MarkColors; readonly frame: { width: number; height: number } },
  ): void {
    paintBrackets(context, placements, options.colors);
    paintDots(context, placements, options.colors);
    for (const group of groupMarks(placements)) paintPill(context, group, options);
  }
}
