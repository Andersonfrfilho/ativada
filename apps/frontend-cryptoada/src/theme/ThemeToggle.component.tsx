// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import controls from '../styles/Controls.module.css';
import styles from './ThemeToggle.module.css';
import { THEME, setTheme, type Theme } from './theme-store.js';
import { useTheme } from './useTheme.hook.js';

export const THEME_LABEL: Readonly<Record<Theme, string>> = {
  [THEME.SYSTEM]: 'automático',
  [THEME.LIGHT]: 'claro',
  [THEME.DARK]: 'escuro',
};

const NEXT_THEME: Readonly<Record<Theme, Theme>> = {
  [THEME.SYSTEM]: THEME.LIGHT,
  [THEME.LIGHT]: THEME.DARK,
  [THEME.DARK]: THEME.SYSTEM,
};

export function ThemeToggle(): ReactElement {
  const theme = useTheme();

  function handleClick(): void {
    setTheme(NEXT_THEME[theme]);
  }

  return (
    <button
      type="button"
      className={`${controls.button} ${styles.toggle}`}
      onClick={handleClick}
      aria-label={`Alternar tema (atual: ${THEME_LABEL[theme]})`}
    >
      Tema: {THEME_LABEL[theme]}
    </button>
  );
}
