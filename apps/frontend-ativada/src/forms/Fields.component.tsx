// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ChangeEvent, ReactElement } from 'react';

import controls from '../styles/Controls.module.css';

export type FieldOption = { readonly value: string; readonly label: string };

type FieldHintProps = { readonly id: string; readonly hint: string | undefined };

function FieldHint({ id, hint }: FieldHintProps): ReactElement | null {
  if (hint === undefined) return null;
  return (
    <span id={`${id}-hint`} className={controls.hint}>
      {hint}
    </span>
  );
}

function describedBy(id: string, hint: string | undefined): string | undefined {
  return hint === undefined ? undefined : `${id}-hint`;
}

export type TextFieldProps = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: 'text' | 'date' | 'number';
  readonly hint?: string;
};

export function TextField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  hint,
}: TextFieldProps): ReactElement {
  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange(event.target.value);
  }

  return (
    <div className={controls.field}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        className={controls.input}
        value={value}
        onChange={handleChange}
        aria-describedby={describedBy(id, hint)}
      />
      <FieldHint id={id} hint={hint} />
    </div>
  );
}

export type SelectFieldProps = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly FieldOption[];
  readonly onChange: (value: string) => void;
  readonly hint?: string;
};

export function SelectField({
  id,
  label,
  value,
  options,
  onChange,
  hint,
}: SelectFieldProps): ReactElement {
  function handleChange(event: ChangeEvent<HTMLSelectElement>): void {
    onChange(event.target.value);
  }

  return (
    <div className={controls.field}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className={controls.input}
        value={value}
        onChange={handleChange}
        aria-describedby={describedBy(id, hint)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldHint id={id} hint={hint} />
    </div>
  );
}
