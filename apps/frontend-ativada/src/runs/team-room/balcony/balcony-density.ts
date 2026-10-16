// Copyright (c) 2026 Ada Technology. All rights reserved.
export const DENSITY = {
  COMFORTABLE: 'comfortable',
  COMPACT: 'compact',
  COLLAPSED: 'collapsed',
} as const;
export type Density = (typeof DENSITY)[keyof typeof DENSITY];
export type DensityChoice = 'auto' | typeof DENSITY.COMFORTABLE | typeof DENSITY.COMPACT;

export const DENSITY_STORAGE_KEY = 'ativada.balcony-density';
// Alturas úteis da janela (CSS px): a varanda confortável pede 800+, a compacta 640+; abaixo disso só os avatares.
export const COMFORTABLE_MIN_HEIGHT = 800;
export const COMPACT_MIN_HEIGHT = 640;

// O padrão sai da medida da janela; a escolha explícita da pessoa vale, mas nunca deixa o gráfico sem altura útil.
export function resolveDensity(choice: DensityChoice, viewportHeight: number): Density {
  if (viewportHeight < COMPACT_MIN_HEIGHT) return DENSITY.COLLAPSED;
  if (choice !== 'auto') return choice;
  return viewportHeight >= COMFORTABLE_MIN_HEIGHT ? DENSITY.COMFORTABLE : DENSITY.COMPACT;
}

export function readChoice(storage: Pick<Storage, 'getItem'> | undefined): DensityChoice {
  try {
    const value = storage?.getItem(DENSITY_STORAGE_KEY);
    return value === DENSITY.COMFORTABLE || value === DENSITY.COMPACT ? value : 'auto';
  } catch {
    return 'auto';
  }
}
