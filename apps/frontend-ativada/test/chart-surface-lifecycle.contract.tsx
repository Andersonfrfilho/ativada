// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readdirSync, readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, type ReactElement } from 'react';

import { ChartCredit, CHART_CREDIT_URL } from '../src/runs/candle-chart/ChartCredit.component.js';
import {
  ChartSurfaceLoaderContext,
  type ChartSurfaceLoader,
} from '../src/runs/candle-chart/chart-surface-loader.js';
import { useChartSurface } from '../src/runs/candle-chart/useChartSurface.hook.js';
import { useSurfaceTheme } from '../src/runs/candle-chart/useSurfaceTheme.hook.js';
import { applyStoredTheme, setTheme, THEME } from '../src/theme/theme-store.js';
import { createFakeSurfaceFactory, type FakeChartSurface } from './support/fake-chart-surface.js';

// Spec 009 T3.1: o dono do ciclo de vida da superfície e a troca de tema, com a superfície falsa no lugar da biblioteca.

function SurfaceOwner(): ReactElement {
  const { containerRef, surface, hasFailed } = useChartSurface();
  useSurfaceTheme(surface);
  return (
    <div>
      <div ref={containerRef} data-testid="canvas" />
      {hasFailed ? <p>Falhou</p> : null}
    </div>
  );
}

function renderOwner(loader: ChartSurfaceLoader, isStrict: boolean): void {
  const owner = (
    <ChartSurfaceLoaderContext value={loader}>
      <SurfaceOwner />
    </ChartSurfaceLoaderContext>
  );
  render(isStrict ? <StrictMode>{owner}</StrictMode> : owner);
}

function renderWithFakeSurfaces(): FakeChartSurface[] {
  const { factory, created } = createFakeSurfaceFactory();
  renderOwner(() => Promise.resolve(factory), false);
  return created;
}

const LIGHT_TOKENS: Readonly<Record<string, string>> = {
  '--surface': 'rgb(255, 255, 255)',
  '--ink-3': 'rgb(95, 107, 134)',
  '--chart-grid': 'rgb(170, 175, 190)',
  '--buy': 'rgb(8, 122, 82)',
  '--sell': 'rgb(192, 53, 61)',
  '--accent': 'rgb(37, 65, 178)',
  '--cone-up': 'rgb(40, 140, 100)',
  '--cone-down': 'rgb(200, 90, 95)',
  '--cone-neutral': 'rgb(120, 130, 150)',
};

function applyTokens(tokens: Readonly<Record<string, string>>): void {
  for (const [token, value] of Object.entries(tokens)) {
    document.documentElement.style.setProperty(token, value);
  }
}

function lastTheme(surface: FakeChartSurface | undefined): unknown {
  return surface?.callsOf('setTheme').at(-1)?.[0];
}

beforeEach(() => {
  applyStoredTheme(localStorage, document.documentElement);
  applyTokens(LIGHT_TOKENS);
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('style');
});

describe('useChartSurface: ciclo de vida no React 19', () => {
  test('creates the surface in the container and destroys it on unmount', async () => {
    const { factory, created } = createFakeSurfaceFactory();
    const view = render(
      <ChartSurfaceLoaderContext value={() => Promise.resolve(factory)}>
        <SurfaceOwner />
      </ChartSurfaceLoaderContext>,
    );
    await waitFor(() => expect(created.length).toBe(1));
    expect(created[0]?.container).toBe(screen.getByTestId('canvas'));
    view.unmount();
    expect(created[0]?.isDestroyed()).toBe(true);
  });

  test('StrictMode mounts twice without leaking: every surface made is destroyed but the last', async () => {
    const { factory, created } = createFakeSurfaceFactory();
    renderOwner(() => Promise.resolve(factory), true);
    await waitFor(() => expect(created.filter((item) => !item.isDestroyed()).length).toBe(1));
    expect(created.length).toBeLessThanOrEqual(2);
    const alive = created.filter((item) => !item.isDestroyed());
    expect(alive[0]).toBe(created.at(-1));
    cleanup();
    expect(created.every((item) => item.isDestroyed())).toBe(true);
  });

  test('a library that finishes loading after the unmount builds nothing', async () => {
    const { factory, created } = createFakeSurfaceFactory();
    let release: (() => void) | undefined;
    const loader: ChartSurfaceLoader = () =>
      new Promise((resolve) => {
        release = (): void => resolve(factory);
      });
    const view = render(
      <ChartSurfaceLoaderContext value={loader}>
        <SurfaceOwner />
      </ChartSurfaceLoaderContext>,
    );
    view.unmount();
    await act(async () => {
      release?.();
      await Promise.resolve();
    });
    expect(created.length).toBe(0);
  });

  test('a library that fails to load is reported, not thrown', async () => {
    renderOwner(() => Promise.reject(new Error('chunk')), false);
    expect(await screen.findByText('Falhou')).toBeDefined();
  });
});

describe('useSurfaceTheme: cores dos tokens', () => {
  test('hands the resolved tokens to a new surface', async () => {
    const created = renderWithFakeSurfaces();
    await waitFor(() => expect(lastTheme(created[0])).toBeDefined());
    expect(lastTheme(created[0])).toEqual({
      background: 'rgb(255, 255, 255)',
      text: 'rgb(95, 107, 134)',
      grid: 'rgb(170, 175, 190)',
      up: 'rgb(8, 122, 82)',
      down: 'rgb(192, 53, 61)',
      line: 'rgb(37, 65, 178)',
      coneUp: 'rgb(40, 140, 100)',
      coneDown: 'rgb(200, 90, 95)',
      coneNeutral: 'rgb(120, 130, 150)',
    });
  });

  test('switching the theme applies the new colors to the same surface', async () => {
    const created = renderWithFakeSurfaces();
    await waitFor(() => expect(created[0]?.callsOf('setTheme').length).toBe(1));
    applyTokens({ '--surface': 'rgb(19, 26, 44)', '--buy': 'rgb(65, 204, 148)' });
    act(() => setTheme(THEME.DARK));
    await waitFor(() => expect(created[0]?.callsOf('setTheme').length).toBe(2));
    expect(lastTheme(created[0])).toMatchObject({
      background: 'rgb(19, 26, 44)',
      up: 'rgb(65, 204, 148)',
    });
    expect(created.length).toBe(1);
  });
});

describe('ChartCredit: aviso do NOTICE (RF22)', () => {
  test('names the library, the year and holder, and links to the author site', () => {
    render(<ChartCredit />);
    const link = screen.getByRole('link', { name: 'TradingView Lightweight Charts™' });
    expect(link.getAttribute('href')).toBe('https://www.tradingview.com/');
    expect(link.getAttribute('href')).toBe(CHART_CREDIT_URL);
    expect(link.getAttribute('rel')).toBe('noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.parentElement?.textContent).toContain('Copyright (c) 2025 TradingView, Inc.');
  });
});

describe('adaptador carregado sob demanda (P14)', () => {
  test('only the loader reaches the adapter, and by dynamic import, so the build makes it its own chunk', () => {
    const directory = new URL('../src/runs/candle-chart/', import.meta.url);
    const files = readdirSync(directory).filter((name) => /\.tsx?$/.test(name));
    const staticImporters = files.filter(
      (name) =>
        !name.startsWith('lightweight-') &&
        readFileSync(new URL(name, directory), 'utf8').includes("from './lightweight-surface.js'"),
    );
    expect(staticImporters).toEqual([]);
    const loader = readFileSync(new URL('chart-surface-loader.ts', directory), 'utf8');
    expect(loader).toContain("await import('./lightweight-surface.js')");
  });
});
