// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import type { PairSeries } from './market-source.js';

// Reexecuta a lógica do preview da spec 009 (`docs/preview/grafico-binance/index.html`, placar aproximado Donchian 20 +
// MACD 12/26/9, limiar ±2) sobre as velas de LINK 1h do BANCO, no mesmo intervalo do preview, para conferir 171 de 346.

type PreviewCandle = { t: number; o: number; h: number; l: number; c: number; v: number };
type PreviewHistory = { scored: number; hits: number };
type PreviewLogic = {
  computeSeries: (candles: PreviewCandle[]) => { rows: unknown[] };
  history: (rows: unknown[], untilIndex: number) => PreviewHistory;
};

const PREVIEW_PATH = 'docs/preview/grafico-binance/index.html';
const SCRIPT_START = '<script>// Lógica do preview';

function loadPreviewLogic(html: string): PreviewLogic {
  const start = html.indexOf(SCRIPT_START);
  const end = html.indexOf('</script>', start);
  if (start < 0 || end < 0) throw new Error('bloco de lógica do preview não encontrado');
  const sandbox: { ChartLogic?: PreviewLogic } = {};
  runInNewContext(html.slice(start + '<script>'.length, end), sandbox);
  if (sandbox.ChartLogic === undefined) throw new Error('o preview não definiu ChartLogic');
  return sandbox.ChartLogic;
}

function previewRange(html: string): { first: number; last: number } {
  const match = /id="data">(\{.*?\})<\/script>/s.exec(html);
  if (match?.[1] === undefined) throw new Error('dados do preview não encontrados');
  const data = JSON.parse(match[1]) as { hours: number[][] };
  const first = data.hours[0]?.[0];
  const last = data.hours.at(-1)?.[0];
  if (first === undefined || last === undefined) throw new Error('preview sem horas');
  return { first, last };
}

export type PreviewCheck = {
  first: number;
  last: number;
  candles: number;
  scored: number;
  hits: number;
};

export function checkAgainstPreview(link1h: PairSeries): PreviewCheck {
  const html = readFileSync(PREVIEW_PATH, 'utf8');
  const { first, last } = previewRange(html);
  const inside = link1h.candles.filter(
    (candle) => candle.openTime >= first && candle.openTime <= last,
  );
  const candles = inside.map((candle) => ({
    t: candle.openTime,
    o: Number(candle.open),
    h: Number(candle.high),
    l: Number(candle.low),
    c: Number(candle.close),
    v: Number(candle.volume),
  }));
  const logic = loadPreviewLogic(html);
  const { rows } = logic.computeSeries(candles);
  const history = logic.history(rows, rows.length - 1);
  return { first, last, candles: candles.length, scored: history.scored, hits: history.hits };
}
