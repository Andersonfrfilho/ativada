// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { render, screen } from '@testing-library/react';

import { SelectField, TextField } from '../src/forms/Fields.component.js';

const NO_OPTIONS = [{ value: 'a', label: 'A' }];

describe('field hint', () => {
  test('a text field with a hint shows it and points to it with aria-describedby', () => {
    render(
      <TextField id="target" label="Alvo" value="" onChange={() => undefined} hint="Ex.: 3" />,
    );
    const input = screen.getByLabelText('Alvo');
    expect(input.getAttribute('aria-describedby')).toBe('target-hint');
    expect(document.getElementById('target-hint')?.textContent).toBe('Ex.: 3');
  });

  test('a select with a hint shows it and points to it with aria-describedby', () => {
    render(
      <SelectField
        id="pair"
        label="Par"
        value="a"
        options={NO_OPTIONS}
        onChange={() => undefined}
        hint="A moeda"
      />,
    );
    expect(screen.getByLabelText('Par').getAttribute('aria-describedby')).toBe('pair-hint');
    expect(document.getElementById('pair-hint')?.textContent).toBe('A moeda');
  });

  test('without a hint there is no description element and no aria-describedby', () => {
    render(<TextField id="plain" label="Livre" value="" onChange={() => undefined} />);
    expect(screen.getByLabelText('Livre').getAttribute('aria-describedby')).toBeNull();
    expect(document.getElementById('plain-hint')).toBeNull();
  });
});
