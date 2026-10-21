// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  RUN_KIND,
  RUN_STATUS,
  type RunRecord,
  type TimeRange,
  type WalkForwardWindowInput,
} from '@ativada/database';
import { ENGINE_TIMEFRAME, ENGINE_TIMEFRAME_DURATION_MILLISECONDS } from '@ativada/strategy-engine';

import { RequestValidationError } from '../../shared/http/request-validation.error.js';
import { RUN_RANGE_FIELD, RUN_RANGE_REASON } from '../runs.constant.js';

export type RunRangeSource = Pick<
  RunRecord,
  'kind' | 'status' | 'periodStart' | 'periodEnd' | 'lastCandleTime' | 'timeframe'
>;

function toRange(from: number, to: number): TimeRange | undefined {
  return to > from ? { from, to } : undefined;
}

// A vela processada mais recente fecha uma duração depois da abertura; a faixa é semiaberta, então vai até esse fechamento.
function rangeUntilLastCandle(run: RunRangeSource): TimeRange | undefined {
  const timeframe = Object.values(ENGINE_TIMEFRAME).find(
    (candidate) => candidate === run.timeframe,
  );
  if (timeframe === undefined || run.lastCandleTime === undefined) return undefined;
  return toRange(
    run.periodStart,
    run.lastCandleTime + ENGINE_TIMEFRAME_DURATION_MILLISECONDS[timeframe],
  );
}

function rangeOfTestWindows(windows: readonly WalkForwardWindowInput[]): TimeRange | undefined {
  if (windows.length === 0) return undefined;
  const starts = windows.map((window) => window.testStart);
  const ends = windows.map((window) => window.testEnd);
  return toRange(Math.min(...starts), Math.max(...ends));
}

// A faixa em que a execução tem preço e operações (ADR 0002, spec 005, O1): o aquecimento antes do início e o ajuste do
// walk-forward ficam de fora, e o ao vivo para na última vela que a própria execução processou. `undefined` = faixa vazia.
export function resolveRunRange(
  run: RunRangeSource,
  windows: readonly WalkForwardWindowInput[],
): TimeRange | undefined {
  if (run.kind === RUN_KIND.WALK_FORWARD) return rangeOfTestWindows(windows);
  if (run.kind === RUN_KIND.BACKTEST && run.status === RUN_STATUS.COMPLETED) {
    return run.periodEnd === undefined ? undefined : toRange(run.periodStart, run.periodEnd);
  }
  return rangeUntilLastCandle(run);
}

// A faixa pedida é recortada à da execução; sem interseção é 400 (e nunca um gráfico vazio que parece certo).
export function clipRange(
  runRange: TimeRange,
  requested: { readonly from?: number | undefined; readonly to?: number | undefined },
): TimeRange {
  const from = Math.max(requested.from ?? runRange.from, runRange.from);
  const to = Math.min(requested.to ?? runRange.to, runRange.to);
  if (to <= from) {
    throw new RequestValidationError([
      { field: RUN_RANGE_FIELD.FROM, reason: RUN_RANGE_REASON.OUTSIDE_RUN },
    ]);
  }
  return { from, to };
}
