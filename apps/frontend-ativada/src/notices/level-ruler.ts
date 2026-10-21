// Copyright (c) 2026 Ada Technology. All rights reserved.
import { divideFloor, formatScaled, parseScaled, roundScaledHalfUp } from '../format/decimal.js';
import { formatPriceAtTick } from './symbol-filters.js';

export const RULER_CURSOR = { NOW: 'now', EXIT: 'exit' } as const;
export type RulerCursorKind = (typeof RULER_CURSOR)[keyof typeof RULER_CURSOR];

export type RulerInput = {
  readonly symbol: string;
  readonly entry: string;
  readonly target: string;
  readonly stop: string;
  readonly cursor: { readonly kind: RulerCursorKind; readonly price: string } | undefined;
};

export type RulerMark = {
  readonly key: 'stop' | 'entry' | 'target';
  readonly label: string;
  readonly priceText: string;
  readonly percentText: string | undefined;
  // Posição na régua em % da largura (desenho: o ÚNICO uso de Number, nunca em dinheiro).
  readonly position: number;
};

export type RulerCursor = { readonly label: string; readonly position: number };

export type RulerModel = {
  readonly marks: readonly RulerMark[];
  readonly cursor: RulerCursor | undefined;
  readonly legend: string;
  readonly description: string;
};

const PAD_DIVISOR = 10n;
const FULL_WIDTH = 100;
const ZERO = 0n;
const PERCENT_FACTOR = 100n;

type Scaled = { readonly entry: bigint; readonly target: bigint; readonly stop: bigint };
type Domain = { readonly low: bigint; readonly high: bigint };

function readScaled(input: RulerInput): Scaled | undefined {
  const entry = parseScaled(input.entry);
  const target = parseScaled(input.target);
  const stop = parseScaled(input.stop);
  if (entry === undefined || target === undefined || stop === undefined) return undefined;
  return stop < entry && entry < target ? { entry, target, stop } : undefined;
}

function toPosition(value: bigint, domain: Domain): number {
  const span = domain.high - domain.low;
  return (Number(value - domain.low) / Number(span)) * FULL_WIDTH;
}

// O menos tipográfico (U+2212), como nas frases do servidor.
export function toTypographicMinus(text: string): string {
  return text.startsWith('-') ? `−${text.slice(1)}` : text;
}

// Distância até o nível, em % do preço de entrada com 2 casas (arredondamento comum: é distância, não dinheiro).
function percentOf(price: bigint, entry: bigint): string {
  const rate = divideFloor(price - entry, entry) ?? ZERO;
  const percent = roundScaledHalfUp(rate * PERCENT_FACTOR, 2);
  return toTypographicMinus(`${percent > ZERO ? '+' : ''}${formatScaled(percent)}%`);
}

function formatRatio(scaled: Scaled): string {
  const ratio = divideFloor(scaled.target - scaled.entry, scaled.entry - scaled.stop) ?? ZERO;
  const rounded = roundScaledHalfUp(ratio, 1);
  return `${formatScaled(rounded, { minimumFraction: 1, maximumFraction: 1 })} : 1`;
}

function buildMarks(input: RulerInput, scaled: Scaled, domain: Domain): RulerMark[] {
  const price = (text: string): string => formatPriceAtTick(input.symbol, text);
  return [
    {
      key: 'stop',
      label: 'Proteção',
      priceText: price(input.stop),
      percentText: percentOf(scaled.stop, scaled.entry),
      position: toPosition(scaled.stop, domain),
    },
    {
      key: 'entry',
      label: 'Entrada',
      priceText: price(input.entry),
      percentText: undefined,
      position: toPosition(scaled.entry, domain),
    },
    {
      key: 'target',
      label: 'Alvo',
      priceText: price(input.target),
      percentText: percentOf(scaled.target, scaled.entry),
      position: toPosition(scaled.target, domain),
    },
  ];
}

function buildDomain(scaled: Scaled, cursorValue: bigint | undefined): Domain {
  const values = [scaled.stop, scaled.entry, scaled.target];
  if (cursorValue !== undefined) values.push(cursorValue);
  const low = values.reduce((smallest, value) => (value < smallest ? value : smallest));
  const high = values.reduce((biggest, value) => (value > biggest ? value : biggest));
  const pad = (high - low) / PAD_DIVISOR;
  return { low: low - pad, high: high + pad };
}

function buildCursor(
  input: RulerInput,
  value: bigint | undefined,
  domain: Domain,
): RulerCursor | undefined {
  if (input.cursor === undefined || value === undefined) return undefined;
  const word = input.cursor.kind === RULER_CURSOR.NOW ? 'Agora' : 'Saiu';
  const label = `${word} ${formatPriceAtTick(input.symbol, input.cursor.price)}`;
  return { label, position: toPosition(value, domain) };
}

function describeRuler(
  marks: readonly RulerMark[],
  cursor: RulerCursor | undefined,
  legend: string,
): string {
  const levels = marks.map(
    (mark) =>
      `${mark.label} ${mark.priceText}${mark.percentText === undefined ? '' : ` (${mark.percentText})`}`,
  );
  return `Níveis da operação: ${levels.join(', ')}${cursor === undefined ? '' : `. ${cursor.label}`}. ${legend}.`;
}

// A régua dos níveis: proteção, entrada e alvo com %, as duas zonas e o cursor ("agora" ou "saiu", mesmo fora da faixa).
export function buildRuler(input: RulerInput): RulerModel | undefined {
  const scaled = readScaled(input);
  if (scaled === undefined) return undefined;
  const cursorValue = input.cursor === undefined ? undefined : parseScaled(input.cursor.price);
  const domain = buildDomain(scaled, cursorValue);
  const marks = buildMarks(input, scaled, domain);
  const loss = percentOf(scaled.stop, scaled.entry);
  const gain = percentOf(scaled.target, scaled.entry);
  const legend = `Perda possível ${loss} · Ganho possível ${gain} · Ganho ÷ perda ${formatRatio(scaled)}`;
  const cursor = buildCursor(input, cursorValue, domain);
  return { marks, cursor, legend, description: describeRuler(marks, cursor, legend) };
}
