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

export function describeOutcomes(combination: Combination): string {
  const { evaluation } = combination;
  return [
    `chegou ao alvo em ${formatPercent(Number(evaluation.reachRate))} das ${evaluation.windowCount} janelas`,
    `parou na perda máxima em ${formatPercent(Number(evaluation.stopRate))}`,
    formatDays(evaluation.medianDaysToTarget),
  ].join(' · ');
}

export function describeBenchmark(combination: Combination): string {
  const { benchmark } = combination.evaluation;
  return `comprar e segurar: ${formatPercent(Number(benchmark.reachRate))} chegaram ao alvo e ${formatPercent(Number(benchmark.stopRate))} pararam na perda máxima`;
}
