// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { GridValue } from '../../packages/strategy-engine/src/index.js';

export type GridParameterInput = { readonly path: string; readonly values: readonly GridValue[] };
export type Assignment = Readonly<Record<string, GridValue>>;

export type NeighborPlan = {
  readonly label: string;
  // `null` na linha-base (parâmetros de fábrica); senão o único parâmetro que difere dela.
  readonly changedPath: string | null;
  readonly assignment: Assignment;
};

export type BuildNeighborPlansParams = {
  readonly parameters: readonly GridParameterInput[];
  readonly baseline: Assignment;
};

export function toFixedGrid(assignment: Assignment): {
  readonly parameters: readonly GridParameterInput[];
} {
  return {
    parameters: Object.entries(assignment).map(([path, value]) => ({ path, values: [value] })),
  };
}

function describeAssignment(path: string, value: GridValue): string {
  return `${path.split('.').slice(-1).join('')}=${String(value)}`;
}

// A linha-base e, para cada parâmetro, um plano por OUTRO valor da grade com todo o resto nos valores de fábrica.
export function buildNeighborPlans(params: BuildNeighborPlansParams): readonly NeighborPlan[] {
  const plans: NeighborPlan[] = [
    { label: 'parâmetros de fábrica', changedPath: null, assignment: params.baseline },
  ];
  for (const parameter of params.parameters) {
    for (const value of parameter.values) {
      if (value === params.baseline[parameter.path]) continue;
      plans.push({
        label: describeAssignment(parameter.path, value),
        changedPath: parameter.path,
        assignment: { ...params.baseline, [parameter.path]: value },
      });
    }
  }
  return plans;
}
