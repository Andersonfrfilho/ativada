// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { SurfaceTheme } from './chart-surface.types.js';
import type { LevelBoxesPrimitive } from './level-boxes-primitive.js';
import type {
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  LibraryKit,
  Time,
  UTCTimestamp,
} from './lightweight-surface.js';
import type { SurfaceState } from './surface-state.js';

// Peças do adaptador da biblioteca. Só `lightweight-surface.ts` importa o pacote; os irmãos `lightweight-*.ts` recebem
// os valores da biblioteca por `kit` e os tipos reexportados dele, então a troca da biblioteca continua num lugar só.
export type Layers = {
  lines: ISeriesApi<'Line'>[];
  cone: ISeriesApi<'Line'>[];
  score: ISeriesApi<'Histogram'> | undefined;
  scoreLevels: IPriceLine[];
};

export type Context = {
  readonly kit: LibraryKit;
  readonly chart: IChartApi;
  readonly candles: ISeriesApi<'Candlestick'>;
  readonly volume: ISeriesApi<'Histogram'>;
  readonly forming: ISeriesApi<'Candlestick'>;
  readonly realPrice: ISeriesApi<'Line'>;
  readonly markers: ISeriesMarkersPluginApi<Time>;
  readonly boxes: LevelBoxesPrimitive;
  readonly state: SurfaceState;
  readonly layers: Layers;
  // Quem escuta a cruz (ver `placeCrosshair`).
  readonly crosshairListeners: Set<(index: number | null) => void>;
};

export type Render = (ctx: Context, theme: SurfaceTheme) => void;
export type Stamped<TItem extends { readonly time: number }> = TItem & { time: UTCTimestamp };

// A biblioteca exige o tipo nominal de tempo; um inteiro de segundos é o que ele representa.
function isTimestamp(value: number): value is UTCTimestamp {
  return Number.isInteger(value);
}

export function toTime(value: number): UTCTimestamp {
  if (!isTimestamp(value)) throw new RangeError('O tempo do gráfico é em segundos inteiros.');
  return value;
}

export function stamp<TItem extends { readonly time: number }>(
  items: readonly TItem[],
): Stamped<TItem>[] {
  return items.map((item) => ({ ...item, time: toTime(item.time) }));
}

// Sem tema ainda (a superfície acabou de nascer) nada é desenhado; o `setTheme` repinta tudo.
export function paint(ctx: Context, ...renders: readonly Render[]): void {
  const { theme } = ctx.state;
  if (theme !== undefined) renders.forEach((render) => render(ctx, theme));
}
