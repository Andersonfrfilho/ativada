// Copyright (c) 2026 Ada Technology. All rights reserved.

export type TooltipFrame = { readonly width: number; readonly height: number };
export type TooltipPoint = { readonly x: number; readonly y: number };

export const TOOLTIP_MAX_WIDTH = 280;
const GAP = 16;
const EDGE = 4;

export type PlacementParams = {
  // Onde está o cursor, no canto superior esquerdo do gráfico; sem ele (teclado), o balão fica no canto.
  readonly pointer: TooltipPoint | undefined;
  readonly frame: TooltipFrame;
  readonly tip: TooltipFrame;
};

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

// O balão fica ao lado do cursor, nunca em cima da vela apontada: à direita, e do outro lado quando falta lugar na borda.
export function placeTooltip({ pointer, frame, tip }: PlacementParams): TooltipPoint {
  if (pointer === undefined) return { x: EDGE, y: EDGE };
  const fitsRight = pointer.x + GAP + tip.width <= frame.width - EDGE;
  const x = fitsRight ? pointer.x + GAP : pointer.x - GAP - tip.width;
  const y = clamp(pointer.y - tip.height / 2, EDGE, frame.height - tip.height - EDGE);
  return { x: clamp(x, EDGE, frame.width - tip.width - EDGE), y };
}
