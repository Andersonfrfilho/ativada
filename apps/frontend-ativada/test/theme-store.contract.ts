// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  applyStoredTheme,
  getTheme,
  setTheme,
  subscribeToTheme,
} from '../src/theme/theme-store.js';

describe('theme store', () => {
  test('defaults to following the system and leaves the document unforced', () => {
    applyStoredTheme(window.localStorage, document.documentElement);
    expect(getTheme()).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  test('forces light or dark on the document, remembers it and notifies subscribers', () => {
    let notifications = 0;
    const unsubscribe = subscribeToTheme(() => void (notifications += 1));
    setTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem('ativada-theme')).toBe('dark');
    expect(notifications).toBe(1);
    setTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    unsubscribe();
    setTheme('light');
    expect(notifications).toBe(2);
  });

  test('restores the saved choice and ignores an invalid saved value', () => {
    window.localStorage.setItem('ativada-theme', 'light');
    applyStoredTheme(window.localStorage, document.documentElement);
    expect(getTheme()).toBe('light');
    window.localStorage.setItem('ativada-theme', 'neon');
    applyStoredTheme(window.localStorage, document.documentElement);
    expect(getTheme()).toBe('system');
  });
});
