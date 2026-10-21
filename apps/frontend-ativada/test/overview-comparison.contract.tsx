// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { render, screen, within } from '@testing-library/react';

import { ComparisonBars } from '../src/overview/ComparisonBars.component.js';

function group(): HTMLElement {
  return screen.getByRole('group', { name: 'Comparação com comprar e segurar' });
}

describe('barras de comparação com comprar e segurar', () => {
  test('flat simulation against a falling market: equal sign and arrow down, scale of 3%', () => {
    render(<ComparisonBars initial="10000.00" equity="10000.00" benchmark="9799.50" />);
    const text = group().textContent ?? '';
    expect(text).toContain('Sua simulação');
    expect(text).toContain('Comprar e segurar');
    expect(text).toContain('teria hoje 9.799,50 USDT');
    expect(text).toContain('= 0,00%');
    expect(text).toContain('−2,01%');
    expect(text).toContain('−3%');
    expect(text).toContain('+3%');
  });

  test('a gain shows the plus sign and widens the scale to fit the biggest bar', () => {
    render(<ComparisonBars initial="10000.00" equity="10750.00" benchmark="10100.00" />);
    const text = group().textContent ?? '';
    expect(text).toContain('+7,50%');
    expect(text).toContain('+1,00%');
    expect(text).toContain('+10%');
    expect(within(group()).getAllByText(/%/).length).toBeGreaterThan(2);
  });

  test('the percent rounds down and the arrow follows the rounded value', () => {
    render(<ComparisonBars initial="10000.00" equity="10000.90" benchmark="9999.95" />);
    const text = group().textContent ?? '';
    expect(text).toContain('= 0,00%');
    expect(text).not.toContain('+0,01%');
    expect(text).toContain('−0,01%');
  });

  test('without a usable starting balance nothing is drawn', () => {
    const { container } = render(<ComparisonBars initial="0" equity="1" benchmark="1" />);
    expect(container.textContent).toBe('');
  });
});
