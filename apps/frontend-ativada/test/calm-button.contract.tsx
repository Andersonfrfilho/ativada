// Copyright (c) 2026 Ada Technology. All rights reserved.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'bun:test';

import { CALM_STORAGE_KEY, readCalm } from '../src/runs/team-room/motion/calm-store.js';
import { CalmToggle } from '../src/runs/trading-room/RoomParts.component.js';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function renderControls(): void {
  render(<CalmToggle />);
}

describe('botão Calmo', () => {
  test('starts off, turns on, is remembered in localStorage and turns off again', () => {
    renderControls();
    const button = screen.getByRole('button', { name: 'Calmo' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem(CALM_STORAGE_KEY)).toBe('true');
    expect(readCalm()).toBe(true);
    fireEvent.click(button);
    expect(localStorage.getItem(CALM_STORAGE_KEY)).toBe('false');
  });

  test('a remembered choice shows pressed on the next visit', () => {
    localStorage.setItem(CALM_STORAGE_KEY, 'true');
    renderControls();
    expect(screen.getByRole('button', { name: 'Calmo' }).getAttribute('aria-pressed')).toBe('true');
  });

  test('without usable storage the choice still works on screen and nothing throws', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('blocked');
      },
    });
    try {
      renderControls();
      expect(readCalm()).toBe(false);
      fireEvent.click(screen.getByRole('button', { name: 'Calmo' }));
      expect(screen.getByRole('button', { name: 'Calmo' }).getAttribute('aria-pressed')).toBe(
        'false',
      );
    } finally {
      if (original !== undefined) Object.defineProperty(globalThis, 'localStorage', original);
    }
  });
});
