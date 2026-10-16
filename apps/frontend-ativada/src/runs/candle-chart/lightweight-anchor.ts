// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ChartSurface, SurfaceAnchor, SurfaceAnchorKind } from './chart-surface.types.js';
import { toTime, type Context } from './lightweight-context.js';

const VOLUME_PANE = 0;

type Spot = { readonly time: number; readonly price: number };

// O ponto do gráfico que cada agente comenta (a banda de baixo, a média rápida, a barra de volume, o nível de proteção): sempre o
// da vela mais recente, nas coordenadas do contêiner do gráfico. `null` quando a camada não está desenhada.
function spotOf(ctx: Context, kind: SurfaceAnchorKind): Spot | undefined {
  const { state } = ctx;
  const lastCandle = state.candles.at(-1);
  if (kind === 'volume') {
    const bar = state.volume.at(-1);
    return bar === undefined ? undefined : { time: bar.time, price: bar.value };
  }
  if (kind === 'protection') {
    const stop = state.priceLevels.find((level) => level.role === 'stop');
    return stop === undefined || lastCandle === undefined
      ? undefined
      : { time: lastCandle.time, price: stop.price };
  }
  const line = state.lines.find((item) => item.role === kind);
  const point = line?.points.at(-1);
  return point === undefined ? undefined : { time: point.time, price: point.value };
}

// As bordas da coluna da vela em formação: o centro da vela de agora menos ou mais meio espaçamento entre barras. Com vela de
// exibição, a coluna cobre as velas da vela da execução inteira: do início dela ao fim, contadas em espaçamentos de barra.
function formingEdgeOf(ctx: Context, kind: 'forming_left' | 'forming_right'): SurfaceAnchor | null {
  const { live, formingSlot } = ctx.state;
  if (live === null) return null;
  const x = ctx.chart.timeScale().timeToCoordinate(toTime(live.time));
  if (x === null) return null;
  const spacing = ctx.chart.timeScale().options().barSpacing;
  const before = formingSlot === null ? 0 : (live.time - formingSlot.from) / formingSlot.barSeconds;
  const after =
    formingSlot === null ? 0 : (formingSlot.to - live.time) / formingSlot.barSeconds - 1;
  const half = spacing / 2;
  return {
    x: kind === 'forming_left' ? x - half - before * spacing : x + half + after * spacing,
    y: 0,
  };
}

export function buildAnchors(ctx: Context): Pick<ChartSurface, 'anchorOf'> {
  return {
    anchorOf: (kind): SurfaceAnchor | null => {
      if (kind === 'forming_left' || kind === 'forming_right') return formingEdgeOf(ctx, kind);
      const spot = spotOf(ctx, kind);
      if (spot === undefined) return null;
      const x = ctx.chart.timeScale().timeToCoordinate(toTime(spot.time));
      if (kind === 'volume') {
        const y = ctx.volume.priceToCoordinate(spot.price);
        const offset = ctx.chart.panes()[VOLUME_PANE]?.getHeight() ?? 0;
        return x === null || y === null ? null : { x, y: y + offset };
      }
      const y = ctx.candles.priceToCoordinate(spot.price);
      return x === null || y === null ? null : { x, y };
    },
  };
}
