// Copyright (c) 2026 Ada Technology. All rights reserved.
export const THEME = { SYSTEM: 'system', LIGHT: 'light', DARK: 'dark' } as const;
export type Theme = (typeof THEME)[keyof typeof THEME];

const THEME_STORAGE_KEY = 'ativada-theme';
const THEME_ATTRIBUTE = 'data-theme';
const THEMES: readonly string[] = Object.values(THEME);

let currentTheme: Theme = THEME.SYSTEM;
let storage: Storage | undefined;
let root: HTMLElement | undefined;
const listeners = new Set<() => void>();

export function isTheme(value: string | null): value is Theme {
  return value !== null && THEMES.includes(value);
}

function readStored(source: Storage): Theme {
  try {
    const stored = source.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : THEME.SYSTEM;
  } catch {
    return THEME.SYSTEM;
  }
}

function applyToDocument(target: HTMLElement | undefined, theme: Theme): void {
  if (target === undefined) return;
  if (theme === THEME.SYSTEM) target.removeAttribute(THEME_ATTRIBUTE);
  else target.setAttribute(THEME_ATTRIBUTE, theme);
}

// O tema é preferência só deste navegador: fica em localStorage (nunca o token) e sem ele segue o sistema.
export function applyStoredTheme(source: Storage, target: HTMLElement): void {
  storage = source;
  root = target;
  currentTheme = readStored(source);
  applyToDocument(root, currentTheme);
  listeners.forEach((listener) => listener());
}

export function getTheme(): Theme {
  return currentTheme;
}

export function setTheme(theme: Theme): void {
  currentTheme = theme;
  applyToDocument(root, theme);
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Sem armazenamento (janela privada): a escolha vale só até recarregar.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeToTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
