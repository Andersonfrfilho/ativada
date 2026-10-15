// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parseScaled } from '../format/decimal.js';
import { parseMetrics, type Run } from '../runs/run.validation.js';

const ZERO = 0n;
const TWO = 2n;

export type GroupedRun = {
  readonly run: Run;
  // Retorno total em fração escalada (8 casas); `undefined` quando a execução não terminou ou o motor não o definiu.
  readonly result: bigint | undefined;
};

export type RunGroup = {
  readonly key: string;
  readonly runs: readonly GroupedRun[];
};

export type GroupSummary = {
  readonly measuredCount: number;
  readonly positiveCount: number;
  readonly median: bigint | undefined;
  readonly best: GroupedRun | undefined;
  readonly worst: GroupedRun | undefined;
};

function readResult(run: Run): bigint | undefined {
  const value = parseMetrics(run.metrics)?.totalReturn.value;
  if (value === null || value === undefined) return undefined;
  return parseScaled(value);
}

function byResultDescending(left: GroupedRun, right: GroupedRun): number {
  if (left.result === undefined) return right.result === undefined ? 0 : 1;
  if (right.result === undefined) return -1;
  if (left.result === right.result) return 0;
  return left.result > right.result ? -1 : 1;
}

// Agrupa o que está carregado pela versão da estratégia (na ordem em que aparece) e ordena cada grupo pelo resultado, maior primeiro.
export function groupRuns(runs: readonly Run[]): readonly RunGroup[] {
  const groups = new Map<string, GroupedRun[]>();
  for (const run of runs) {
    const entry: GroupedRun = { run, result: readResult(run) };
    groups.set(run.strategyVersionId, [...(groups.get(run.strategyVersionId) ?? []), entry]);
  }
  return [...groups.entries()].map(([key, items]) => ({
    key,
    runs: [...items].sort(byResultDescending),
  }));
}

function median(sorted: readonly bigint[]): bigint | undefined {
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  if (upper === undefined) return undefined;
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[middle - 1];
  return lower === undefined ? undefined : (lower + upper) / TWO;
}

export function summarizeGroup(group: RunGroup): GroupSummary {
  const measured = group.runs.filter((item) => item.result !== undefined);
  const values = measured.flatMap((item) => (item.result === undefined ? [] : [item.result]));
  const sorted = [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return {
    measuredCount: measured.length,
    positiveCount: values.filter((value) => value > ZERO).length,
    median: median(sorted),
    best: measured[0],
    worst: measured.at(-1),
  };
}
