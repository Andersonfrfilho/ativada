// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { CheckContext, RecordedStep } from './engine-contract-types.fixture.js';

// Os checks de corte (sem lookahead, retomada) reexecutam o cenário por corte: O(n²). Por padrão cortam onde
// o motor decide algo; a bateria completa (todo corte) roda sob FULL_CONTRACT=1 (`make contract-full`).
export const FULL_CONTRACT_VARIABLE = 'FULL_CONTRACT';
const FIRST_CANDLES = 3;
const SPACED_CUTS = 8;
// Um defeito que carimba no passado precisa enxergar alguns candles depois do corte para aparecer.
export const LOOKAHEAD_HORIZON_CANDLES = 3;

export function isFullContract(): boolean {
  return Bun.env[FULL_CONTRACT_VARIABLE] === '1';
}

function isEventful(step: RecordedStep): boolean {
  const { decisions } = step.result;
  const hasSignalAction = decisions.signal !== null && decisions.signal.action !== 'HOLD';
  return (
    hasSignalAction ||
    decisions.orders.length > 0 ||
    decisions.fills.length > 0 ||
    decisions.commands.length > 0
  );
}

function leadInOf(context: CheckContext): number {
  return context.baseline[0]?.result.state.signal.leadInCandles ?? 0;
}

// Índices de corte (0 .. n−2): os primeiros candles, os dois lados do pré-aquecimento, todo candle com
// sinal que não é HOLD, ordem, preenchimento ou comando, e alguns índices fixos espaçados.
export function selectCutIndexes(context: CheckContext): readonly number[] {
  const lastCut = context.scenario.candles.length - 2;
  const all = Array.from({ length: lastCut + 1 }, (_unused, index) => index);
  if (isFullContract()) return all;
  const leadIn = leadInOf(context);
  const picked = new Set<number>();
  for (const index of all) {
    const step = context.baseline[index];
    const isLeadInEdge = index === leadIn - 2 || index === leadIn - 1 || index === leadIn;
    const isSpaced = index % Math.max(1, Math.floor(all.length / SPACED_CUTS)) === 0;
    if (index < FIRST_CANDLES || isLeadInEdge || isSpaced) picked.add(index);
    if (step !== undefined && isEventful(step)) picked.add(index);
  }
  return [...picked].sort((left, right) => left - right);
}
