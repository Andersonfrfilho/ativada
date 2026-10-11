// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { SelectField, TextField } from '../forms/Fields.component.js';
import controls from '../styles/Controls.module.css';
import type { Leaf } from './config-leaves.js';
import styles from './Strategies.module.css';
import { emptyRow, MAX_GRID_ROWS, type GridRow } from './walk-forward-form.validation.js';

export type GridRowsProps = {
  readonly rows: readonly GridRow[];
  readonly options: readonly Leaf[];
  readonly onChange: (rows: readonly GridRow[]) => void;
};

// A grade do walk-forward: cada linha é um parâmetro do catálogo e a lista de valores a testar.
export function GridRows({ rows, options, onChange }: GridRowsProps): ReactElement {
  function replace(index: number, patch: Partial<GridRow>): void {
    onChange(rows.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className={styles.fields}>
      {rows.map((row, index) => (
        <div key={index} className={styles.group}>
          <SelectField
            id={`wf-param-${index}`}
            label={`Parâmetro ${index + 1}`}
            value={row.key}
            options={[
              { value: '', label: 'Escolha…' },
              ...options.map((leaf) => ({ value: leaf.key, label: leaf.label })),
            ]}
            onChange={(key) => replace(index, { key })}
          />
          <TextField
            id={`wf-values-${index}`}
            label={`Valores do parâmetro ${index + 1}`}
            value={row.values}
            onChange={(values) => replace(index, { values })}
          />
        </div>
      ))}
      {rows.length < MAX_GRID_ROWS ? (
        <button
          type="button"
          className={controls.button}
          onClick={() => onChange([...rows, emptyRow()])}
        >
          Adicionar parâmetro
        </button>
      ) : null}
    </div>
  );
}
