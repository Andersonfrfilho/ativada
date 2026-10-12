// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  formatAssignment,
  formatDate,
  formatMoney,
  formatNumber,
  formatPercent,
  markdownTable,
} from './format-values.js';
import type { RunSummary, WindowSummary } from './report.types.js';

export function renderAggregateTable(summary: RunSummary): string[] {
  const rows: readonly (readonly string[])[] = [
    [
      'Retorno líquido de custos (fora da amostra, concatenado)',
      formatPercent(summary.totalReturn),
    ],
    ['Retorno anualizado', formatPercent(summary.annualizedReturn)],
    ['Comprar e segurar nos mesmos meses de teste', formatPercent(summary.benchmarkReturn)],
    ['Diferença para comprar e segurar', formatPercent(summary.excessReturn)],
    [
      'Sharpe / Sortino',
      `${formatNumber(summary.sharpe, 2)} / ${formatNumber(summary.sortino, 2)}`,
    ],
    [
      'Queda máxima (drawdown) / duração',
      `${formatPercent(summary.maxDrawdownDepth)} / ${summary.maxDrawdownDays} dias`,
    ],
    ['Operações fechadas', String(summary.trades)],
    ['Taxa de acerto', formatPercent(summary.winRate, 1)],
    ['Fator de lucro (ganhos ÷ perdas)', formatNumber(summary.profitFactor, 2)],
    ['Tempo exposto ao mercado', formatPercent(summary.exposure, 1)],
    ['Taxas pagas', formatMoney(summary.feesPaid)],
    ['Resultado em dinheiro fictício (saldo inicial US$ 10.000)', formatMoney(summary.netProfit)],
  ];
  return markdownTable(['Medida', 'Valor'], rows);
}

function renderWindowRow(window: WindowSummary): readonly string[] {
  return [
    String(window.index + 1),
    `${formatDate(window.testStart)} a ${formatDate(window.testEnd)}`,
    window.isEligible ? formatAssignment(window.assignment) : 'nenhum elegível (ficou parado)',
    formatNumber(window.inSampleSharpe, 2),
    formatPercent(window.totalReturn),
    formatPercent(window.benchmarkReturn),
    formatPercent(window.maxDrawdown),
    String(window.trades),
    formatPercent(window.winRate, 0),
  ];
}

export function renderWindowsTable(windows: readonly WindowSummary[]): string[] {
  return markdownTable(
    [
      '#',
      'Meses de teste',
      'Parâmetros escolhidos no ajuste',
      'Sharpe no ajuste',
      'Retorno no teste',
      'Comprar e segurar',
      'Queda máx.',
      'Operações',
      'Acerto',
    ],
    windows.map(renderWindowRow),
  );
}
