// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState } from 'react';

import { ApiError } from '../http/api.error.js';
import type { FormProblem } from '../forms/ProblemList.component.js';
import { applyLeafEdits, listLeaves, type Leaf } from './config-leaves.js';
import type { ParameterEditorProps } from './ParameterEditor.component.js';
import { useAddVersionMutation } from './strategy.mutation.js';

const CONFIG_PREFIX = 'config.';
const REASON_TEXT: Readonly<Record<string, string>> = {
  invalid_value: 'valor inválido.',
  too_small: 'valor pequeno demais.',
  too_big: 'valor grande demais.',
  unknown_field: 'campo desconhecido.',
};

function problemsFromError(error: Error | null, leaves: readonly Leaf[]): FormProblem[] {
  if (error === null) return [];
  if (!(error instanceof ApiError) || error.details.length === 0) {
    return [{ field: 'Salvar', message: 'não foi possível salvar. Tente novamente.' }];
  }
  return error.details.map((detail) => {
    const path = detail.field.startsWith(CONFIG_PREFIX)
      ? detail.field.slice(CONFIG_PREFIX.length)
      : detail.field;
    const leaf = leaves.find((candidate) => candidate.path.join('.') === path);
    return {
      field: leaf?.label ?? detail.field,
      message: REASON_TEXT[detail.reason] ?? detail.reason,
    };
  });
}

export type ParameterEditorState = {
  readonly leaves: readonly Leaf[];
  readonly edits: Readonly<Record<string, string>>;
  readonly problems: readonly FormProblem[];
  readonly canSave: boolean;
  readonly setEdit: (key: string, value: string) => void;
  readonly save: () => void;
};

export function useParameterEditor(props: ParameterEditorProps): ParameterEditorState {
  const { strategyId, base, knownVersionIds, onSaved } = props;
  const leaves = listLeaves(base.config);
  const [edits, setEdits] = useState<Readonly<Record<string, string>>>({});
  const [clientProblems, setClientProblems] = useState<readonly FormProblem[]>([]);
  const add = useAddVersionMutation();

  function save(): void {
    const result = applyLeafEdits(base.config, edits);
    const labels = new Map(leaves.map((leaf) => [leaf.key, leaf.label]));
    const found = result.problems.map((p) => ({
      field: labels.get(p.key) ?? p.key,
      message: p.message,
    }));
    setClientProblems(found);
    if (found.length > 0) return;
    add.mutate(
      { strategyId, config: result.config },
      {
        onSuccess: ({ version }) => {
          setEdits({});
          onSaved({ version, isNew: !knownVersionIds.includes(version.id) });
        },
      },
    );
  }

  return {
    leaves,
    edits,
    problems: clientProblems.length > 0 ? clientProblems : problemsFromError(add.error, leaves),
    canSave: Object.keys(edits).length > 0 && !add.isPending,
    setEdit: (key, value) => setEdits((current) => ({ ...current, [key]: value })),
    save,
  };
}
