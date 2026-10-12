// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatPercent } from '../format/format.js';
import type { Combination } from './goal.validation.js';

const COMMA_DECIMAL_DIGITS = 1;

export function formatDays(text: string | null): string {
  if (text === null) return 'sem tempo típico';
  const days = Number(text);
  const shown = Number.isInteger(days)
    ? String(days)
    : days.toFixed(COMMA_DECIMAL_DIGITS).replace('.', ',');
  return `tempo típico ${shown} ${days === 1 ? 'dia' : 'dias'}`;
}

function formatRate(rate: string | null): string {
  return rate === null ? '—' : formatPercent(Number(rate));
}

export function describeOutcomes(combination: Combination): string {
  const { evaluation } = combination;
  if (evaluation.windowCount === 0) return 'histórico curto demais para formar janelas';
  return [
    `chegou ao alvo em ${formatRate(evaluation.reachRate)} das ${evaluation.windowCount} janelas`,
    `parou na perda máxima em ${formatRate(evaluation.stopRate)}`,
    formatDays(evaluation.medianDaysToTarget),
  ].join(' · ');
}

export function describeBenchmark(combination: Combination): string {
  const { benchmark } = combination.evaluation;
  if (benchmark.reachRate === null && benchmark.stopRate === null) {
    return 'comprar e segurar: indisponível, sem janelas no histórico';
  }
  return `comprar e segurar: ${formatRate(benchmark.reachRate)} chegaram ao alvo e ${formatRate(benchmark.stopRate)} pararam na perda máxima`;
}
