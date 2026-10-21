// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { Locator } from '@playwright/test';

export type CanvasStats = {
  // Pixels de cor diferente da cor de fundo (a mais comum): zero é um canvas vazio.
  readonly drawn: number;
  // Cores distintas (canais de 4 bits), de 1 a 4.096.
  readonly colors: number;
  readonly width: number;
  readonly height: number;
  // Pixels que mudaram de cor desde a fotografia pedida (0 sem fotografia).
  readonly changed: number;
};

type SnapshotKeys = readonly [previous: string | null, next: string | null];
type Snapshots = Record<string, Uint8ClampedArray>;

declare global {
  interface Window {
    __canvasSnapshots?: Snapshots;
  }
}

// Roda NO NAVEGADOR (o Playwright serializa só esta função): compõe os canvases do gráfico (a biblioteca empilha camadas) num
// só, conta o que foi desenhado e compara com uma fotografia anterior. Por isso nada aqui chama função de fora.
function composeAndMeasure(root: Element, keys: SnapshotKeys): CanvasStats {
  const [previousKey, nextKey] = keys;
  const box = root.getBoundingClientRect();
  const ratio = window.devicePixelRatio;
  const width = Math.max(1, Math.round(box.width * ratio));
  const height = Math.max(1, Math.round(box.height * ratio));
  const surface = document.createElement('canvas');
  surface.width = width;
  surface.height = height;
  const context = surface.getContext('2d');
  if (context === null) throw new Error('sem contexto 2d');
  for (const canvas of root.querySelectorAll('canvas')) {
    const rect = canvas.getBoundingClientRect();
    context.drawImage(
      canvas,
      Math.round((rect.left - box.left) * ratio),
      Math.round((rect.top - box.top) * ratio),
      Math.round(rect.width * ratio),
      Math.round(rect.height * ratio),
    );
  }
  const pixels = context.getImageData(0, 0, width, height).data;
  const store: Snapshots = window.__canvasSnapshots ?? {};
  window.__canvasSnapshots = store;
  const counts = new Map<number, number>();
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const key =
      ((pixels[offset] ?? 0) >> 4) * 256 +
      ((pixels[offset + 1] ?? 0) >> 4) * 16 +
      ((pixels[offset + 2] ?? 0) >> 4);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const background = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
  let changed = 0;
  const before = previousKey === null ? undefined : store[previousKey];
  if (before !== undefined) {
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const difference =
        Math.abs((before[offset] ?? 0) - (pixels[offset] ?? 0)) +
        Math.abs((before[offset + 1] ?? 0) - (pixels[offset + 1] ?? 0)) +
        Math.abs((before[offset + 2] ?? 0) - (pixels[offset + 2] ?? 0));
      if (difference > 24) changed += 1;
    }
  }
  if (nextKey !== null) store[nextKey] = pixels;
  return {
    drawn: width * height - (background?.[1] ?? 0),
    colors: counts.size,
    width,
    height,
    changed,
  };
}

export async function readCanvasStats(chart: Locator): Promise<CanvasStats> {
  return chart.evaluate(composeAndMeasure, [null, null] as const);
}

// Guarda uma fotografia do canvas sob um nome, para comparar depois com `countChangedPixels`.
export async function takeCanvasSnapshot(chart: Locator, name: string): Promise<void> {
  await chart.evaluate(composeAndMeasure, [null, name] as const);
}

// Quantos pixels mudaram de cor (acima de uma tolerância) desde a fotografia.
export async function countChangedPixels(chart: Locator, since: string): Promise<number> {
  const stats = await chart.evaluate(composeAndMeasure, [since, null] as const);
  return stats.changed;
}
