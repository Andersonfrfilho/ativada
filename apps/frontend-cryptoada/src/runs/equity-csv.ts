// Copyright (c) 2026 Ada Technology. All rights reserved.
import { CURVE_MAX_POINTS } from './run.constant.js';

export type CurvePoint = {
  readonly time: number;
  readonly equity: number;
  readonly benchmark: number;
};

const HEADER = 'candle_time,equity,equity_at_low,benchmark';
const COLUMNS = 4;

// O CSV do registro (`export.csv?table=equity`) é a forma de ler a curva inteira de um backtest sem paginar centenas de vezes.
export function parseEquityCsv(text: string): CurvePoint[] {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  if (header !== HEADER) throw new Error('Cabeçalho inesperado no CSV da curva.');
  return lines.map((line) => {
    const cells = line.split(',');
    const time = Number(cells[0]);
    const equity = Number(cells[1]);
    const benchmark = Number(cells[3]);
    if (cells.length !== COLUMNS || [time, equity, benchmark].some(Number.isNaN)) {
      throw new Error('Linha inválida no CSV da curva.');
    }
    return { time, equity, benchmark };
  });
}

// Mantém o primeiro e o último ponto e espaça o resto: o desenho não precisa de mais que isso.
export function downsample(points: readonly CurvePoint[], limit = CURVE_MAX_POINTS): CurvePoint[] {
  if (points.length <= limit) return [...points];
  const step = (points.length - 1) / (limit - 1);
  const selected = new Set(Array.from({ length: limit }, (_, index) => Math.round(index * step)));
  return points.filter((_, index) => selected.has(index));
}
