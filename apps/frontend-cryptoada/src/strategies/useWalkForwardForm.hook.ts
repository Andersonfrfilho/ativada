// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';

import { useAppConfig } from '../app/useAppContext.hook.js';
import { problemsFromApiError } from '../backtests/backtest-form.validation.js';
import type { FormProblem } from '../forms/ProblemList.component.js';
import { useCreateRunMutation } from '../runs/runs.query.js';
import { listLeaves, type Leaf } from './config-leaves.js';
import type { StrategyVersion } from './strategy.validation.js';
import {
  buildWalkForwardRequest,
  defaultWalkForwardValues,
  validateWalkForwardForm,
  type WalkForwardFormValues,
} from './walk-forward-form.validation.js';

export type WalkForwardForm = {
  readonly values: WalkForwardFormValues;
  readonly leaves: readonly Leaf[];
  readonly problems: readonly FormProblem[];
  readonly isPending: boolean;
  readonly patch: (patch: Partial<WalkForwardFormValues>) => void;
  readonly submit: (event: FormEvent<HTMLFormElement>) => void;
};

export function useWalkForwardForm(version: StrategyVersion): WalkForwardForm {
  const { marketSymbols } = useAppConfig();
  const navigate = useNavigate();
  const create = useCreateRunMutation();
  const leaves = listLeaves(version.config);
  const [edits, setEdits] = useState<Partial<WalkForwardFormValues>>({});
  const [clientProblems, setClientProblems] = useState<readonly FormProblem[]>([]);
  const values: WalkForwardFormValues = {
    ...defaultWalkForwardValues(Date.now(), marketSymbols[0] ?? ''),
    ...edits,
    versionId: version.id,
  };

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const found = validateWalkForwardForm(values, leaves);
    setClientProblems(found);
    if (found.length > 0) return;
    create.mutate(buildWalkForwardRequest(values, leaves), {
      onSuccess: (run) => void navigate(`/backtests/${run.id}`),
    });
  }

  return {
    values,
    leaves,
    problems: clientProblems.length > 0 ? clientProblems : problemsFromApiError(create.error),
    isPending: create.isPending,
    patch: (patch) => setEdits((current) => ({ ...current, ...patch })),
    submit,
  };
}
