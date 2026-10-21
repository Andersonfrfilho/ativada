// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Trade } from '../run.validation.js';
import { BRACKET_EXIT_REASONS } from './candle-chart.constant.js';
import type { StrategyLayers } from './strategy-layers.validation.js';

// Mapeamento da vela da execução (15 min) para a vela de exibição (3 min), spec 017 D3. Tudo em milissegundos UTC e puro: a
// estratégia decide na vela da execução; a vela de exibição só mostra o caminho do preço por dentro dela.
export type DisplayMapping = {
  readonly runMilliseconds: number;
  readonly displayMilliseconds: number;
};

// `undefined` quando a vela mostrada é a da execução (ou maior, ou não divide): nada muda, a visão é a da spec 009.
export function createDisplayMapping(
  runMilliseconds: number | undefined,
  shownMilliseconds: number | undefined,
): DisplayMapping | undefined {
  if (runMilliseconds === undefined || shownMilliseconds === undefined) return undefined;
  if (shownMilliseconds <= 0 || shownMilliseconds >= runMilliseconds) return undefined;
  if (runMilliseconds % shownMilliseconds !== 0) return undefined;
  return { runMilliseconds, displayMilliseconds: shownMilliseconds };
}

// A abertura da vela de `duration` que contém o instante (as velas abrem em múltiplos da duração, em UTC).
export function bucketOf(instant: number, duration: number): number {
  return Math.floor(instant / duration) * duration;
}

export function slotCount(mapping: DisplayMapping): number {
  return mapping.runMilliseconds / mapping.displayMilliseconds;
}

// A opinião da vela decidida `t` (abertura) nasce no fechamento dela e vale até o fechamento da vela seguinte: `[t + d, t + 2d)`.
export function validityStart(decidedOpen: number, mapping: DisplayMapping): number {
  return decidedOpen + mapping.runMilliseconds;
}

// As aberturas das velas de exibição em que a opinião valeu (5 velas de 3 min para uma de 15 min).
export function slotOpens(decidedOpen: number, mapping: DisplayMapping): number[] {
  const start = validityStart(decidedOpen, mapping);
  return Array.from(
    { length: slotCount(mapping) },
    (_unused, index) => start + index * mapping.displayMilliseconds,
  );
}

export type OpinionWindow = { readonly issuedAt: number; readonly validUntil: number };

// A opinião que valia na vela de exibição apontada: nasceu na abertura da vela de 15 min dela e vale até a abertura da seguinte.
export function opinionWindowAt(shownOpen: number, mapping: DisplayMapping): OpinionWindow {
  const issuedAt = bucketOf(shownOpen, mapping.runMilliseconds);
  return { issuedAt, validUntil: issuedAt + mapping.runMilliseconds };
}

// A abertura da vela decidida cuja opinião valia na vela de exibição apontada (a equipe fala dela).
export function decidedOpenAt(shownOpen: number, mapping: DisplayMapping): number {
  return opinionWindowAt(shownOpen, mapping).issuedAt - mapping.runMilliseconds;
}

function repeatPerSlot<TValue>(
  column: readonly TValue[],
  opens: readonly (readonly number[])[],
): TValue[] {
  return column.flatMap((value, index) => (opens[index] ?? []).map(() => value));
}

// Placar, linhas e limiares desenhados onde valeram: cada posição da vela decidida vira os degraus das velas de exibição de
// `[t + d, t + 2d)` (valor constante, muda só no fechamento de 15 min). Nada é interpolado nem inventado.
export function expandLayers(layers: StrategyLayers, mapping: DisplayMapping): StrategyLayers {
  const opens = layers.candleTimes.map((time) => slotOpens(time, mapping));
  const lastSlotOffset = mapping.runMilliseconds - mapping.displayMilliseconds;
  return {
    ...layers,
    candleTimes: opens.flat(),
    score: repeatPerSlot(layers.score, opens),
    actions: repeatPerSlot(layers.actions, opens),
    atr: repeatPerSlot(layers.atr, opens),
    lines: layers.lines.map((line) => ({ ...line, values: repeatPerSlot(line.values, opens) })),
    thresholds: layers.thresholds.map((segment) => ({
      ...segment,
      from: validityStart(segment.from, mapping),
      to: validityStart(segment.to, mapping) + lastSlotOffset,
    })),
  };
}

// "Esperou": um ponto por decisão de esperar, na primeira vela de exibição em que a decisão já existia.
export function waitedOpens(decidedOpens: readonly number[], mapping: DisplayMapping): number[] {
  return decidedOpens.map((open) => validityStart(open, mapping));
}

// Saída por alvo, proteção ou lacuna: o motor só sabe a vela de 15 min em que aconteceu (ADR 0002, V8).
export type ExitBracket = {
  readonly positionKey: string;
  // A abertura da primeira e da última vela de exibição da vela de 15 min da saída.
  readonly firstOpen: number;
  readonly lastOpen: number;
  readonly reason: string;
  // O intervalo da vela de 15 min, para a dica "entre 10:15 e 10:30".
  readonly from: number;
  readonly to: number;
};

export function listExitBrackets(trades: readonly Trade[], mapping: DisplayMapping): ExitBracket[] {
  return trades.flatMap((trade) => {
    const { closedCandleTime: closed, exitReason: reason } = trade;
    if (closed === undefined || reason === undefined) return [];
    if (!BRACKET_EXIT_REASONS.includes(reason)) return [];
    const from = bucketOf(closed, mapping.runMilliseconds);
    const to = from + mapping.runMilliseconds;
    const lastOpen = to - mapping.displayMilliseconds;
    return [{ positionKey: trade.engineKey, firstOpen: from, lastOpen, reason, from, to }];
  });
}
