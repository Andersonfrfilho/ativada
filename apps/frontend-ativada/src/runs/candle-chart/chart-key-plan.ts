// Copyright (c) 2026 Ada Technology. All rights reserved.
import { chartMoveFor } from '../chart-keyboard.js';

// O teclado do gráfico de velas (RF20, D6): uma parada de Tab, e a tecla vira uma ação. Setas andam uma vela, Shift+seta
// pula para a próxima compra ou venda, `+` e `−` aproximam e afastam, Home e End vão às pontas, Esc limpa a cruz e Enter
// seleciona a operação da vela apontada. Função pura: o hook só executa o plano.
export type ChartKeyAction =
  | { readonly type: 'move'; readonly index: number }
  | { readonly type: 'zoom'; readonly step: 1 | -1 }
  | { readonly type: 'clear' }
  | { readonly type: 'pick' };

export type ChartKeyInput = {
  readonly key: string;
  readonly shiftKey: boolean;
  // A vela apontada pelo teclado; `null` antes da primeira tecla.
  readonly current: number | null;
  readonly count: number;
  // Índices das velas que têm compra ou venda, em ordem crescente.
  readonly events: readonly number[];
};

export const CHART_KEYBOARD_HELP =
  'Setas esquerda e direita andam uma vela; Shift com seta pula para a próxima compra ou venda; ' +
  'mais e menos aproximam e afastam; Home e End vão às pontas; Esc limpa a cruz; Enter seleciona a operação.';

const ZOOM_IN_KEYS: ReadonlySet<string> = new Set(['+', '=']);
const ZOOM_OUT_KEYS: ReadonlySet<string> = new Set(['-', '_', '−']);

function jumpToEvent(input: ChartKeyInput, direction: 1 | -1): ChartKeyAction | undefined {
  const { current, events, count } = input;
  const from = current ?? (direction === 1 ? -1 : count);
  const target =
    direction === 1
      ? events.find((index) => index > from)
      : events.findLast((index) => index < from);
  return target === undefined ? undefined : { type: 'move', index: target };
}

function clamp(index: number, count: number): number {
  return Math.min(Math.max(index, 0), count - 1);
}

function stepOne(input: ChartKeyInput, step: number): ChartKeyAction | undefined {
  const { current, count } = input;
  if (current === null) return { type: 'move', index: count - 1 };
  const index = clamp(current + step, count);
  return index === current ? undefined : { type: 'move', index };
}

function planMove(input: ChartKeyInput): ChartKeyAction | undefined {
  const move = chartMoveFor(input.key);
  if (move === undefined || input.count === 0) return undefined;
  if (move === 'first') return { type: 'move', index: 0 };
  if (move === 'last') return { type: 'move', index: input.count - 1 };
  return input.shiftKey ? jumpToEvent(input, move > 0 ? 1 : -1) : stepOne(input, move);
}

// `undefined` = a tecla não é do gráfico (o navegador segue com ela).
export function planChartKey(input: ChartKeyInput): ChartKeyAction | undefined {
  if (ZOOM_IN_KEYS.has(input.key)) return { type: 'zoom', step: 1 };
  if (ZOOM_OUT_KEYS.has(input.key)) return { type: 'zoom', step: -1 };
  if (input.key === 'Escape') return { type: 'clear' };
  if (input.key === 'Enter') return input.current === null ? undefined : { type: 'pick' };
  return planMove(input);
}
