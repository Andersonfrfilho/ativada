// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { TextField } from '../forms/Fields.component.js';
import { ProblemList } from '../forms/ProblemList.component.js';
import { Card } from '../layout/Card.component.js';
import controls from '../styles/Controls.module.css';
import { groupLeaves, type Leaf } from './config-leaves.js';
import styles from './Strategies.module.css';
import { useParameterEditor } from './useParameterEditor.hook.js';
import { shortHash, type StrategyVersion } from './strategy.validation.js';

export type SavedVersion = { readonly version: StrategyVersion; readonly isNew: boolean };

function SaveResult({ saved }: { readonly saved: SavedVersion }): ReactElement {
  const { version, isNew } = saved;
  return (
    <p role="status" className={styles.ok}>
      {isNew
        ? `Versão ${version.version} criada (hash ${shortHash(version.configHash)}).`
        : `Nada mudou: é a versão ${version.version} (mesmo hash ${shortHash(version.configHash)}).`}
    </p>
  );
}

type LeafGroupsProps = {
  readonly leaves: readonly Leaf[];
  readonly edits: Readonly<Record<string, string>>;
  readonly onEdit: (key: string, value: string) => void;
};

function LeafGroups({ leaves, edits, onEdit }: LeafGroupsProps): ReactElement {
  return (
    <>
      {groupLeaves(leaves).map((group) => (
        <fieldset key={group.title} className={styles.group}>
          <legend>{group.title}</legend>
          <div className={styles.fields}>
            {group.leaves.map((leaf) => (
              <TextField
                key={leaf.key}
                id={`leaf-${leaf.key}`}
                label={leaf.label}
                value={edits[leaf.key] ?? leaf.value}
                onChange={(value) => onEdit(leaf.key, value)}
              />
            ))}
          </div>
        </fieldset>
      ))}
    </>
  );
}

export type ParameterEditorProps = {
  readonly strategyId: string;
  readonly base: StrategyVersion;
  readonly knownVersionIds: readonly string[];
  readonly saved: SavedVersion | undefined;
  readonly onSaved: (saved: SavedVersion) => void;
};

// Edita só os números e decimais da versão-base; salvar sempre pede uma versão NOVA (a API devolve a mesma se nada mudou).
export function ParameterEditor(props: ParameterEditorProps): ReactElement {
  const editor = useParameterEditor(props);
  return (
    <Card title={`Parâmetros (base: versão ${props.base.version})`}>
      <LeafGroups leaves={editor.leaves} edits={editor.edits} onEdit={editor.setEdit} />
      <ProblemList problems={editor.problems} />
      {props.saved === undefined ? null : <SaveResult saved={props.saved} />}
      <button
        type="button"
        className={`${controls.button} ${controls.primary}`}
        disabled={!editor.canSave}
        onClick={editor.save}
      >
        Salvar como nova versão
      </button>
    </Card>
  );
}
