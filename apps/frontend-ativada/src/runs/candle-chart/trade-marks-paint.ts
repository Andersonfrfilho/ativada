// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SurfaceMarker } from './chart-surface.types.js';

// Desenho das compras e vendas (spec 009, marcadores de operação): faixa na vela, ponto com halo no preço do preenchimento e
// uma etiqueta com seta, palavra e preço. Estado nunca é só cor: a seta e a palavra vão junto. Sem importar a biblioteca.
export type MarkColors = {
  readonly buy: string;
  readonly sell: string;
  readonly buyBand: string;
  readonly sellBand: string;
  // O halo e o texto da etiqueta: o fundo do gráfico e a cor de tinta do tema.
  readonly halo: string;
  readonly onMark: string;
};

export type MarkPlacement = {
  readonly mark: SurfaceMarker;
  readonly x: number;
  readonly y: number;
  // O x da última vela de exibição do colchete de uma saída decidida dentro da vela da execução.
  readonly endX?: number | undefined;
};

export type MarkFrame = { readonly width: number; readonly height: number };

const BAND_WIDTH = 8;
const DOT_RADIUS = 4.5;
const SELECTED_DOT_RADIUS = 6.5;
const HALO_WIDTH = 2.5;
const PILL_HEIGHT = 20;
const PILL_PADDING = 7;
const PILL_GAP = 12;
const PILL_FONT = '600 12px sans-serif';
const GROUP_DISTANCE = 96;
const EDGE = 2;
const ARROW: Readonly<Record<SurfaceMarker['side'], string>> = { buy: '▲', sell: '▼' };
const PLURAL: Readonly<Record<SurfaceMarker['side'], string>> = {
  buy: 'Compras',
  sell: 'Vendas',
};

type Group = { readonly side: SurfaceMarker['side']; readonly items: MarkPlacement[] };

function colorOf(colors: MarkColors, side: SurfaceMarker['side']): string {
  return side === 'buy' ? colors.buy : colors.sell;
}

// Marcas seguidas do mesmo lado e a menos de uma etiqueta de distância viram uma etiqueta só ("Compras ×3").
export function groupMarks(placements: readonly MarkPlacement[]): Group[] {
  const groups: Group[] = [];
  for (const placement of placements) {
    const open = groups.findLast((group) => group.side === placement.mark.side);
    const first = open?.items[0];
    if (open !== undefined && first !== undefined && placement.x - first.x < GROUP_DISTANCE) {
      open.items.push(placement);
    } else {
      groups.push({ side: placement.mark.side, items: [placement] });
    }
  }
  return groups;
}

export function pillText(group: Group): string {
  const first = group.items[0]?.mark;
  if (first === undefined) return '';
  if (group.items.length === 1) return `${ARROW[group.side]} ${first.label} ${first.priceText}`;
  return `${ARROW[group.side]} ${PLURAL[group.side]} ×${group.items.length}`;
}

export function paintBands(
  context: CanvasRenderingContext2D,
  placements: readonly MarkPlacement[],
  options: { readonly colors: MarkColors; readonly frame: MarkFrame },
): void {
  for (const { mark, x, endX } of placements) {
    context.fillStyle = mark.side === 'buy' ? options.colors.buyBand : options.colors.sellBand;
    const width = endX === undefined ? BAND_WIDTH : endX - x + BAND_WIDTH;
    context.fillRect(x - BAND_WIDTH / 2, 0, width, options.frame.height);
  }
}

const BRACKET_RISE = 18;
const BRACKET_TICK = 7;
const BRACKET_WIDTH = 2;

// O colchete da saída por alvo/proteção: cobre as velas de exibição da vela de 15 min em que o motor decidiu (spec 017).
export function paintBrackets(
  context: CanvasRenderingContext2D,
  placements: readonly MarkPlacement[],
  colors: MarkColors,
): void {
  context.lineWidth = BRACKET_WIDTH;
  for (const { mark, x, y, endX } of placements) {
    if (endX === undefined) continue;
    const top = y - BRACKET_RISE;
    context.beginPath();
    context.moveTo(x - BAND_WIDTH / 2, top + BRACKET_TICK);
    context.lineTo(x - BAND_WIDTH / 2, top);
    context.lineTo(endX + BAND_WIDTH / 2, top);
    context.lineTo(endX + BAND_WIDTH / 2, top + BRACKET_TICK);
    context.strokeStyle = colorOf(colors, mark.side);
    context.stroke();
  }
}

export function paintDots(
  context: CanvasRenderingContext2D,
  placements: readonly MarkPlacement[],
  colors: MarkColors,
): void {
  for (const { mark, x, y } of placements) {
    const radius = mark.isSelected ? SELECTED_DOT_RADIUS : DOT_RADIUS;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = colorOf(colors, mark.side);
    context.fill();
    context.lineWidth = HALO_WIDTH;
    context.strokeStyle = colors.halo;
    context.stroke();
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

export function paintPill(
  context: CanvasRenderingContext2D,
  group: Group,
  options: { readonly colors: MarkColors; readonly frame: MarkFrame },
): void {
  const anchor = group.items[0];
  if (anchor === undefined) return;
  const { colors, frame } = options;
  context.font = PILL_FONT;
  const text = pillText(group);
  const width = context.measureText(text).width + PILL_PADDING * 2;
  const left = clamp(anchor.x - width / 2, EDGE, frame.width - width - EDGE);
  const rawTop = group.side === 'buy' ? anchor.y + PILL_GAP : anchor.y - PILL_GAP - PILL_HEIGHT;
  const top = clamp(rawTop, EDGE, frame.height - PILL_HEIGHT - EDGE);
  context.beginPath();
  context.roundRect(left, top, width, PILL_HEIGHT, PILL_HEIGHT / 2);
  context.fillStyle = colorOf(colors, group.side);
  context.fill();
  context.lineWidth = group.items.some((item) => item.mark.isSelected) ? 3 : HALO_WIDTH;
  context.strokeStyle = colors.halo;
  context.stroke();
  context.fillStyle = colors.onMark;
  context.textBaseline = 'middle';
  context.fillText(text, left + PILL_PADDING, top + PILL_HEIGHT / 2 + 1);
}
