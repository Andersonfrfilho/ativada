// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  ChartSurface,
  ChartSurfaceFactory,
  SurfaceLogicalRange,
} from '../../src/runs/candle-chart/chart-surface.types.js';

// Superfície falsa (spec 009, plan D1): registra cada chamada em ordem e deixa o teste disparar a cruz e a faixa
// visível como a biblioteca dispararia. Nenhum canvas: roda no happy-dom.

export type SurfaceCall = {
  readonly method: keyof ChartSurface;
  readonly args: readonly unknown[];
};

export type FakeChartSurface = ChartSurface & {
  readonly calls: SurfaceCall[];
  readonly container: HTMLElement;
  readonly isDestroyed: () => boolean;
  readonly emitCrosshair: (index: number | null) => void;
  readonly emitClick: (index: number | null) => void;
  readonly emitVisibleRange: (range: SurfaceLogicalRange) => void;
  readonly callsOf: (method: keyof ChartSurface) => readonly (readonly unknown[])[];
};

type Listeners = {
  readonly crosshair: Set<(index: number | null) => void>;
  readonly click: Set<(index: number | null) => void>;
  readonly range: Set<(range: SurfaceLogicalRange) => void>;
};

function subscribe<TListener>(set: Set<TListener>, listener: TListener): () => void {
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

export function createFakeChartSurface(container: HTMLElement): FakeChartSurface {
  const calls: SurfaceCall[] = [];
  const listeners: Listeners = { crosshair: new Set(), click: new Set(), range: new Set() };
  let destroyed = false;
  const record =
    (method: keyof ChartSurface) =>
    (...args: readonly unknown[]): void => {
      if (destroyed) throw new Error(`${method} chamado depois de destroy`);
      calls.push({ method, args });
    };
  return {
    calls,
    container,
    isDestroyed: () => destroyed,
    callsOf: (method) => calls.filter((call) => call.method === method).map((call) => call.args),
    emitCrosshair: (index) => listeners.crosshair.forEach((listener) => listener(index)),
    emitClick: (index) => listeners.click.forEach((listener) => listener(index)),
    emitVisibleRange: (range) => listeners.range.forEach((listener) => listener(range)),
    setCandles: record('setCandles'),
    setVolume: record('setVolume'),
    setLines: record('setLines'),
    setScore: record('setScore'),
    setMarkers: record('setMarkers'),
    setLevels: record('setLevels'),
    setWaited: record('setWaited'),
    setProjection: record('setProjection'),
    setLiveCandle: record('setLiveCandle'),
    setCrosshair: record('setCrosshair'),
    setTheme: record('setTheme'),
    setTimeLabels: record('setTimeLabels'),
    centerOn: record('centerOn'),
    zoom: record('zoom'),
    fit: record('fit'),
    scrollToEnd: record('scrollToEnd'),
    onCrosshairMove: (listener) => subscribe(listeners.crosshair, listener),
    onClick: (listener) => subscribe(listeners.click, listener),
    onVisibleRangeChange: (listener) => subscribe(listeners.range, listener),
    destroy: (): void => {
      destroyed = true;
      listeners.crosshair.clear();
      listeners.click.clear();
      listeners.range.clear();
    },
  };
}

// Fábrica para injetar no componente: guarda cada superfície criada (o StrictMode cria duas).
export function createFakeSurfaceFactory(): {
  readonly factory: ChartSurfaceFactory;
  readonly created: FakeChartSurface[];
} {
  const created: FakeChartSurface[] = [];
  return {
    created,
    factory: (container): FakeChartSurface => {
      const surface = createFakeChartSurface(container);
      created.push(surface);
      return surface;
    },
  };
}
