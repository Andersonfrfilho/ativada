// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SurfaceTheme } from './chart-surface.types.js';

// Cada cor do gráfico é um token de `global.css`; nenhum hexadecimal mora no código (RNF07).
export const SURFACE_THEME_TOKENS = {
  background: '--surface',
  text: '--ink-3',
  grid: '--chart-grid',
  up: '--buy',
  down: '--sell',
  line: '--accent',
  coneUp: '--cone-up',
  coneDown: '--cone-down',
  coneNeutral: '--cone-neutral',
} as const satisfies Record<keyof SurfaceTheme, string>;

export type ColorResolver = (token: string) => string;

export function buildSurfaceTheme(resolve: ColorResolver): SurfaceTheme {
  return {
    background: resolve(SURFACE_THEME_TOKENS.background),
    text: resolve(SURFACE_THEME_TOKENS.text),
    grid: resolve(SURFACE_THEME_TOKENS.grid),
    up: resolve(SURFACE_THEME_TOKENS.up),
    down: resolve(SURFACE_THEME_TOKENS.down),
    line: resolve(SURFACE_THEME_TOKENS.line),
    coneUp: resolve(SURFACE_THEME_TOKENS.coneUp),
    coneDown: resolve(SURFACE_THEME_TOKENS.coneDown),
    coneNeutral: resolve(SURFACE_THEME_TOKENS.coneNeutral),
  };
}

const RGB_PATTERN = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/;
const HEX_PATTERN = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

// Os canais seguem como texto decimal (nada de número para uma cor): o valor só é escrito de volta em `rgba(...)`.
const hexChannel = (pair: string | undefined): string => BigInt(`0x${pair ?? '00'}`).toString();

function toChannels(color: string): readonly [string, string, string] | undefined {
  const rgb = RGB_PATTERN.exec(color);
  if (rgb !== null) return [rgb[1] ?? '0', rgb[2] ?? '0', rgb[3] ?? '0'];
  const hex = HEX_PATTERN.exec(color);
  if (hex === null) return undefined;
  return [hexChannel(hex[1]), hexChannel(hex[2]), hexChannel(hex[3])];
}

// O volume, as caixas e a vela em formação usam a mesma cor da vela, só mais clara; formato que não se lê fica como veio.
export function withAlpha(color: string, alpha: number): string {
  const channels = toChannels(color.trim());
  if (channels === undefined) return color;
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${alpha})`;
}
