// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatDecimal, formatSymbol } from '../../format/format.js';
import {
  formatSignedPercentDown,
  parseScaled,
  roundRateDownToPercent,
} from '../../format/decimal.js';
import type { IconName } from '../../layout/Icon.component.js';
import { RUN_STATUS, statusLabel } from '../../runs/run.constant.js';
import { parseMetrics, type Run } from '../../runs/run.validation.js';
import { kindWord } from './run-switch.constant.js';

const ZERO = 0n;
const MINUS = '−';

export type ResultTone = 'up' | 'down' | 'flat' | 'running' | 'bad';

// Estado é sempre ícone + palavra + cor: a cor nunca fala sozinha.
export type ResultLook = {
  readonly icon: IconName;
  readonly tone: ResultTone;
  readonly text: string;
};

function tradesText(trades: number): string {
  if (trades === 0) return 'sem operações';
  return trades === 1 ? '1 operação' : `${trades} operações`;
}

function completedLook(run: Run): ResultLook {
  const metrics = parseMetrics(run.metrics);
  const value = metrics?.totalReturn.value;
  const rate = value === null || value === undefined ? undefined : parseScaled(value);
  if (metrics === undefined || rate === undefined) {
    return { icon: 'check', tone: 'flat', text: 'Concluída · sem resultado' };
  }
  const trades = tradesText(metrics.trades);
  const rounded = roundRateDownToPercent(rate);
  if (rounded === ZERO) return { icon: 'equal', tone: 'flat', text: `= 0,00% · ${trades}` };
  const text = `${formatSignedPercentDown(rate).replace('-', MINUS)} · ${trades}`;
  return rounded > ZERO
    ? { icon: 'arrowUp', tone: 'up', text }
    : { icon: 'arrowDown', tone: 'down', text };
}

function runningLook(run: Run): ResultLook {
  const equity = parseMetrics(run.metrics)?.finalEquity;
  const balance =
    equity === null || equity === undefined ? '' : ` · saldo ${formatDecimal(equity)}`;
  return { icon: 'activity', tone: 'running', text: `Rodando${balance}` };
}

export function describeResult(run: Run): ResultLook {
  if (run.status === RUN_STATUS.COMPLETED) return completedLook(run);
  if (run.status === RUN_STATUS.RUNNING) return runningLook(run);
  if (run.status === RUN_STATUS.QUEUED) return { icon: 'pause', tone: 'flat', text: 'Na fila' };
  if (run.status === RUN_STATUS.FAILED) return { icon: 'alert', tone: 'bad', text: 'Falhou' };
  if (run.status === RUN_STATUS.CANCELLED) return { icon: 'stop', tone: 'flat', text: 'Cancelada' };
  return { icon: 'info', tone: 'flat', text: statusLabel(run.status) };
}

type TitleParts = {
  readonly symbol: string;
  readonly timeframe: string;
  readonly kind: string;
};

// "BTC/USDT · 1h · Backtest": o nome curto que identifica a execução na lista e no botão.
export function runTitle(parts: TitleParts): string {
  return `${formatSymbol(parts.symbol)} · ${parts.timeframe} · ${kindWord(parts.kind)}`;
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function compact(text: string): string {
  return text.replace(/[^a-z0-9]/g, '');
}

// Cada palavra digitada precisa aparecer em moeda, vela, tipo ou estratégia; "btc usdt" e "btc/usdt" acham o mesmo.
export function matchesQuery(searchable: string, query: string): boolean {
  const haystack = normalize(searchable);
  const squeezed = compact(haystack);
  return normalize(query)
    .split(/\s+/)
    .filter((token) => token !== '')
    .every((token) => haystack.includes(token) || squeezed.includes(compact(token)));
}
