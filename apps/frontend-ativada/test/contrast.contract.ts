// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

const CSS = readFileSync(new URL('../src/styles/global.css', import.meta.url), 'utf8');
const MINIMUM_RATIO = 4.5;

function tokensOf(block: string): Map<string, string> {
  return new Map(
    [...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [
      m[1] ?? '',
      m[2] ?? '',
    ]),
  );
}

function lightTokens(): Map<string, string> {
  return tokensOf(CSS.slice(0, CSS.indexOf('@media')));
}

function darkTokens(): Map<string, string> {
  const start = CSS.indexOf(":root[data-theme='dark']");
  return tokensOf(CSS.slice(start, CSS.indexOf('}', start)));
}

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map((index) =>
    channel(Number.parseInt(hex.slice(index, index + 2), 16)),
  );
  return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
}

function ratio(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

const PAIRS: readonly (readonly [string, string])[] = [
  ['ink', 'bg'],
  ['ink', 'surface'],
  ['ink-2', 'surface'],
  ['ink-3', 'surface'],
  ['ink-3', 'bg'],
  ['buy', 'surface'],
  ['buy', 'bg'],
  ['buy', 'buy-soft'],
  ['sell', 'surface'],
  ['sell', 'sell-soft'],
  ['accent', 'surface'],
  ['on-accent', 'accent'],
  ['warn', 'warn-soft'],
  ['ink', 'buy-soft'],
  ['ink', 'sell-soft'],
  ['ink', 'warn-soft'],
  ['ink', 'surface-2'],
  ['ink-2', 'surface-2'],
  ['bench', 'surface'],
  ['accent', 'surface-2'],
  ['buy', 'surface-2'],
  ['sell', 'surface-2'],
  ['surface', 'ink-2'],
  ['ink', 'accent-soft'],
  ['ink-2', 'accent-soft'],
  ['accent', 'accent-soft'],
  ['ink-3', 'surface-2'],
];

// Setas, linha, halo e contorno do gráfico são elementos gráficos (WCAG 1.4.11): 3:1.
const GRAPHIC_MINIMUM_RATIO = 3;
const GRAPHIC_PAIRS: readonly (readonly [string, string])[] = [
  ['buy', 'surface'],
  ['sell', 'surface'],
  ['accent', 'surface'],
  ['buy', 'accent-soft'],
  ['sell', 'accent-soft'],
  ['ink', 'accent-soft'],
  ['surface', 'buy'],
  ['surface', 'sell'],
  ['bench', 'surface'],
];

for (const [theme, read] of [
  ['light', lightTokens],
  ['dark', darkTokens],
] as const) {
  describe(`${theme} theme contrast`, () => {
    const tokens = read();
    for (const [foreground, background] of PAIRS) {
      test(`${foreground} on ${background} is at least ${MINIMUM_RATIO}:1`, () => {
        const front = tokens.get(foreground);
        const back = tokens.get(background);
        expect(front, foreground).toBeDefined();
        expect(back, background).toBeDefined();
        expect(ratio(front ?? '#000000', back ?? '#ffffff')).toBeGreaterThanOrEqual(MINIMUM_RATIO);
      });
    }
    for (const [foreground, background] of GRAPHIC_PAIRS) {
      test(`graphic ${foreground} on ${background} is at least ${GRAPHIC_MINIMUM_RATIO}:1`, () => {
        const front = tokens.get(foreground) ?? '#000000';
        const back = tokens.get(background) ?? '#ffffff';
        expect(ratio(front, back)).toBeGreaterThanOrEqual(GRAPHIC_MINIMUM_RATIO);
      });
    }
  });
}
