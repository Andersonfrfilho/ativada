// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ChartRange } from './chart-range.js';
import type { Trade } from './run.validation.js';

type TradeMoments = Pick<Trade, 'engineKey' | 'openedCandleTime' | 'closedCandleTime'>;

// O que a seleção de uma operação grava na URL; `range` ausente é "não mexer na faixa".
export type SelectionPlan = {
  readonly key: string;
  readonly range: ChartRange | undefined;
};

export type PlanSelectionParams = {
  readonly trade: TradeMoments;
  // A faixa da URL; sem ela o gráfico mostra tudo e não há para onde mover.
  readonly range: ChartRange | undefined;
  // O período inteiro da execução: a faixa centrada nunca sai dele.
  readonly extent: ChartRange | undefined;
};

type CenterParams = Omit<PlanSelectionParams, 'range'> & { readonly range: ChartRange };

// Mesma largura, centrada no meio da operação (ou na compra, se a operação é mais longa que a faixa) e sem sair do período.
export function centerRangeOn(params: CenterParams): ChartRange {
  const { trade, range, extent } = params;
  const width = range.to - range.from;
  const span = (trade.closedCandleTime ?? trade.openedCandleTime) - trade.openedCandleTime;
  const center = trade.openedCandleTime + (span < width ? span / 2 : 0);
  const wanted = Math.round(center - width / 2);
  const from =
    extent === undefined
      ? wanted
      : Math.min(Math.max(wanted, extent.from), Math.max(extent.to - width, extent.from));
  return { from, to: from + width };
}

// Clicar numa linha marca a operação e, havendo faixa na URL, centraliza o gráfico nela; isso vale também quando a
// operação está fora da faixa atual. Sem faixa ("Tudo") a operação já está toda à vista e a faixa fica como está.
export function planTradeSelection(params: PlanSelectionParams): SelectionPlan {
  const { trade, range } = params;
  if (range === undefined) return { key: trade.engineKey, range: undefined };
  return { key: trade.engineKey, range: centerRangeOn({ ...params, range }) };
}
