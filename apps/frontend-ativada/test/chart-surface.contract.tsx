// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { render } from '@testing-library/react';
import { StrictMode, useEffect, useRef, type ReactElement } from 'react';

import type { ChartSurfaceFactory } from '../src/runs/candle-chart/chart-surface.types.js';
import { createFakeChartSurface, createFakeSurfaceFactory } from './support/fake-chart-surface.js';

// Spike da spec 009 (T0.2): a biblioteca fica atrás da porta `ChartSurface` e os contratos do painel usam a superfície
// falsa. O dono do ciclo de vida real é o `CandleChart` da T3.1; aqui um dono mínimo prova o padrão no StrictMode.

const SOURCE_DIRECTORY = fileURLToPath(new URL('../src', import.meta.url));
const LIBRARY_ADAPTER = join('runs', 'candle-chart', 'lightweight-surface.ts');

function listSourceFiles(directory: string, prefix = ''): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = join(prefix, entry.name);
    if (entry.isDirectory()) return listSourceFiles(join(directory, entry.name), relative);
    return /\.tsx?$/.test(entry.name) ? [relative] : [];
  });
}

function SurfaceOwner({ factory }: { readonly factory: ChartSurfaceFactory }): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;
    const surface = factory(container);
    surface.setCandles([{ time: 60, open: 1, high: 2, low: 0.5, close: 1.5 }]);
    const stop = surface.onCrosshairMove(() => undefined);
    return (): void => {
      stop();
      surface.destroy();
    };
  }, [factory]);
  return <div ref={containerRef} />;
}

describe('porta ChartSurface (spike T0.2)', () => {
  test('o happy-dom não desenha em canvas: por isso os contratos usam a superfície falsa', () => {
    expect(document.createElement('canvas').getContext('2d')).toBeNull();
  });

  test('StrictMode monta duas vezes e nenhuma superfície fica viva além da última', () => {
    const { factory, created } = createFakeSurfaceFactory();
    const view = render(
      <StrictMode>
        <SurfaceOwner factory={factory} />
      </StrictMode>,
    );
    expect(created.length).toBe(2);
    expect(created.filter((surface) => !surface.isDestroyed()).length).toBe(1);
    expect(created.at(-1)?.callsOf('setCandles')).toEqual([
      [[{ time: 60, open: 1, high: 2, low: 0.5, close: 1.5 }]],
    ]);
    view.unmount();
    expect(created.every((surface) => surface.isDestroyed())).toBe(true);
  });

  test('a superfície falsa registra chamadas, entrega eventos e recusa uso depois de destroy', () => {
    const surface = createFakeChartSurface(document.createElement('div'));
    const seen: (number | null)[] = [];
    const stop = surface.onCrosshairMove((index) => seen.push(index));
    surface.emitCrosshair(3);
    stop();
    surface.emitCrosshair(4);
    surface.zoom(1);
    expect(seen).toEqual([3]);
    expect(surface.callsOf('zoom')).toEqual([[1]]);
    surface.destroy();
    expect(() => surface.fit()).toThrow('fit chamado depois de destroy');
  });

  test('só o adaptador importa lightweight-charts', () => {
    const importers = listSourceFiles(SOURCE_DIRECTORY).filter((file) =>
      /from 'lightweight-charts'/.test(readFileSync(join(SOURCE_DIRECTORY, file), 'utf8')),
    );
    expect(importers.filter((file) => file !== LIBRARY_ADAPTER)).toEqual([]);
  });
});
