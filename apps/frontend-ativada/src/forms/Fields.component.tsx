// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ChangeEvent, ReactElement } from 'react';

import controls from '../styles/Controls.module.css';

export type FieldOption = { readonly value: string; readonly label: string };

export type TextFieldProps = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: 'text' | 'date' | 'number';
};

export function TextField({
  id,
  label,
  value,
  onChange,
  type = 'text',
}: TextFieldProps): ReactElement {
  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange(event.target.value);
  }

  return (
    <div className={controls.field}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type={type} className={controls.input} value={value} onChange={handleChange} />
    </div>
  );
}

export type SelectFieldProps = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly FieldOption[];
  readonly onChange: (value: string) => void;
};

export function SelectField({
  id,
  label,
  value,
  options,
  onChange,
}: SelectFieldProps): ReactElement {
  function handleChange(event: ChangeEvent<HTMLSelectElement>): void {
    onChange(event.target.value);
  }

  return (
    <div className={controls.field}>
      <label htmlFor={id}>{label}</label>
      <select id={id} className={controls.input} value={value} onChange={handleChange}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
