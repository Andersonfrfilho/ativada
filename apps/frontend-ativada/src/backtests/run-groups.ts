// Copyright (c) 2026 Ada Technology. All rights reserved.
import { parseScaled } from '../format/decimal.js';
import { parseMetrics, type Run } from '../runs/run.validation.js';

const ZERO = 0n;
const TWO = 2n;

export const RESULT_ORDER = { DESC: 'desc', ASC: 'asc', NONE: 'none' } as const;
export type ResultOrder = (typeof RESULT_ORDER)[keyof typeof RESULT_ORDER];

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

// Quem não tem resultado medido fica sempre no fim, nas duas direções.
function byResult(direction: 1 | -1): (left: GroupedRun, right: GroupedRun) => number {
  return (left, right) => {
    if (left.result === undefined) return right.result === undefined ? 0 : 1;
    if (right.result === undefined) return -1;
    if (left.result === right.result) return 0;
    return left.result > right.result ? -direction : direction;
  };
}

function sortGroup(items: readonly GroupedRun[], order: ResultOrder): readonly GroupedRun[] {
  if (order === RESULT_ORDER.NONE) return items;
  return [...items].sort(byResult(order === RESULT_ORDER.DESC ? 1 : -1));
}

// Agrupa o que está carregado pela versão da estratégia (na ordem em que aparece) e ordena cada grupo pelo resultado (maior primeiro por padrão; "none" mantém a ordem da API).
export function groupRuns(
  runs: readonly Run[],
  order: ResultOrder = RESULT_ORDER.DESC,
): readonly RunGroup[] {
  const groups = new Map<string, GroupedRun[]>();
  for (const run of runs) {
    const entry: GroupedRun = { run, result: readResult(run) };
    const group = groups.get(run.strategyVersionId);
    if (group === undefined) groups.set(run.strategyVersionId, [entry]);
    else group.push(entry);
  }
  return [...groups.entries()].map(([key, items]) => ({
    key,
    runs: sortGroup(items, order),
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
  const byValue = [...measured].sort(byResult(1));
  return {
    measuredCount: measured.length,
    positiveCount: values.filter((value) => value > ZERO).length,
    median: median(sorted),
    best: byValue[0],
    worst: byValue.at(-1),
  };
}
