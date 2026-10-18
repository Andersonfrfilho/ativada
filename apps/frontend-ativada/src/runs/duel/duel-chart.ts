// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatDecimalText, parseScaled } from '../../format/decimal.js';
import { toDrawingNumber } from '../candle-chart/candle-series.js';
import type { Duel } from './duel.validation.js';
import { runLabel } from './duel-text.js';

// Gráfico de patrimônio do duelo (RF21): SVG à mão, escala pura e testável. A ordem dos valores sai de BigInt sobre o texto
// decimal; a coordenada em tela (`toDrawingNumber`) é só desenho e o rótulo do eixo é o próprio texto do servidor.
export const DUEL_CHART_SIZE = { width: 600, height: 260 } as const;
export const DUEL_CHART_PADDING = { left: 64, right: 12, top: 12, bottom: 28 } as const;
const PAD = DUEL_CHART_PADDING;
const TWO_PLACES = { minimumFraction: 2, maximumFraction: 2 } as const;
// Todos os valores iguais: a linha reta fica no meio da altura.
const FLAT_RATIO = 0.5;

export type DuelSeries = {
  readonly runId: string;
  readonly label: string;
  readonly team: Duel['runs'][number]['team'];
  // Trechos contínuos (a execução ainda sem ponto abre um vão, nunca é inventada): "M x y L x y …".
  readonly paths: readonly string[];
  readonly last: string | undefined;
};

export type DuelChartModel = {
  readonly series: readonly DuelSeries[];
  readonly yLabels: readonly { readonly y: number; readonly text: string }[];
  readonly firstTime: number | undefined;
  readonly lastTime: number | undefined;
  readonly hasPoints: boolean;
};

type Extremes = { readonly low: string; readonly high: string };

function extremesOf(duel: Duel): Extremes | undefined {
  const known = duel.curves
    .flatMap((curve) => curve.equity)
    .flatMap((text) => {
      const scaled = text === null ? undefined : parseScaled(text);
      return text === null || scaled === undefined ? [] : [{ text, scaled }];
    });
  const [first] = known;
  if (first === undefined) return undefined;
  const low = known.reduce((best, item) => (item.scaled < best.scaled ? item : best), first);
  const high = known.reduce((best, item) => (item.scaled > best.scaled ? item : best), first);
  return { low: low.text, high: high.text };
}

function scaler(extremes: Extremes): (text: string) => number {
  const low = toDrawingNumber(extremes.low);
  const span = toDrawingNumber(extremes.high) - low;
  const height = DUEL_CHART_SIZE.height - PAD.top - PAD.bottom;
  return (text) => {
    const ratio = span === 0 ? FLAT_RATIO : (toDrawingNumber(text) - low) / span;
    return DUEL_CHART_SIZE.height - PAD.bottom - ratio * height;
  };
}

// Coordenada de tela com uma casa decimal (só desenho).
const tenth = (coordinate: number): number => Math.round(coordinate * 10) / 10;

function toPaths(
  equity: readonly (string | null)[],
  toY: (text: string) => number,
  toX: (index: number) => number,
): string[] {
  const paths: string[] = [];
  let current: string[] = [];
  equity.forEach((text, index) => {
    if (text === null) {
      if (current.length > 0) paths.push(current.join(' '));
      current = [];
      return;
    }
    const command = current.length === 0 ? 'M' : 'L';
    current.push(`${command} ${tenth(toX(index))} ${tenth(toY(text))}`);
  });
  if (current.length > 0) paths.push(current.join(' '));
  return paths;
}

const EMPTY: DuelChartModel = {
  series: [],
  yLabels: [],
  firstTime: undefined,
  lastTime: undefined,
  hasPoints: false,
};

export function buildDuelChart(duel: Duel): DuelChartModel {
  const extremes = extremesOf(duel);
  const count = duel.candleTimes.length;
  if (extremes === undefined || count === 0) return EMPTY;
  const toY = scaler(extremes);
  const width = DUEL_CHART_SIZE.width - PAD.left - PAD.right;
  const toX = (index: number): number =>
    PAD.left + (count === 1 ? 0.5 : index / (count - 1)) * width;
  const series = duel.runs.map((run) => {
    const equity = duel.curves.find((item) => item.runId === run.runId)?.equity ?? [];
    return {
      runId: run.runId,
      label: runLabel(run),
      team: run.team,
      paths: toPaths(equity, toY, toX),
      last: equity.findLast((text) => text !== null) ?? undefined,
    };
  });
  return {
    series,
    yLabels: [
      { y: PAD.top, text: formatDecimalText(extremes.high, TWO_PLACES) },
      { y: DUEL_CHART_SIZE.height - PAD.bottom, text: formatDecimalText(extremes.low, TWO_PLACES) },
    ],
    firstTime: duel.candleTimes[0],
    lastTime: duel.candleTimes[count - 1],
    hasPoints: true,
  };
}
