// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatDate, formatNumber, formatPercent, markdownTable } from './format-values.js';
import { OVERFITTING_REASON_TEXT } from './render-static.js';
import { renderAggregateTable, renderWindowsTable } from './render-tables.js';
import type { ScenarioReport } from './report.types.js';
import { computeWindowStats, countEdgeWindows } from './window-stats.js';

const SENSITIVITY_HIGHLIGHT = 0.05;
const LOW_CONFIDENCE_TRADES = 30;

export function scenarioTitle(scenario: ScenarioReport): string {
  return `${scenario.symbol} ${scenario.timeframe === '1h' ? '1 hora' : '1 dia'}`;
}

export function renderConfidenceNote(scenario: ScenarioReport): string[] {
  const { trades } = scenario.withCosts;
  if (trades >= LOW_CONFIDENCE_TRADES) return [];
  return [
    `**Pouca confiança estatística:** só ${trades} operações no total fora da amostra. Com tão poucas operações, o resultado é dominado pelo acaso e não permite concluir que a estratégia ganha ou perde.`,
    '',
  ];
}

export function renderResults(scenario: ScenarioReport): string[] {
  const stats = computeWindowStats(scenario.withCosts.windows);
  return [
    `### ${scenarioTitle(scenario)}`,
    '',
    `Resultado dos meses de teste emendados (${scenario.withCosts.windows.length} janelas, ${scenario.withCosts.testCandles} candles), com custos.`,
    '',
    ...renderAggregateTable(scenario.withCosts),
    '**Por janela** (cada janela começa com saldo fictício novo; a coluna "Sharpe no ajuste" é o resultado do parâmetro vencedor _dentro_ da amostra):',
    '',
    ...renderWindowsTable(scenario.withCosts.windows),
    `Janelas com retorno positivo: **${stats.positiveWindows} de ${stats.windows}**. Retorno médio por janela: ${formatPercent(stats.meanReturn)}; mediana: ${formatPercent(stats.medianReturn)}; pior: ${formatPercent(stats.worstReturn)}; melhor: ${formatPercent(stats.bestReturn)}. Operações por janela de teste, em média: ${formatNumber(stats.meanTrades, 1)}.`,
    '',
    ...renderConfidenceNote(scenario),
    ...(scenario.withCosts.liquidatedAtWindowEnd > 0
      ? [
          `Em ${scenario.withCosts.liquidatedAtWindowEnd} janela(s) havia posição aberta no fim do teste; ela é encerrada ao preço de fechamento para a janela seguinte começar do zero.`,
          '',
        ]
      : []),
  ];
}

export function renderBenchmark(scenario: ScenarioReport): string[] {
  const { withCosts } = scenario;
  const stats = computeWindowStats(withCosts.windows);
  return [
    `**${scenarioTitle(scenario)}.** Nos mesmos meses de teste, a estratégia fez ${formatPercent(withCosts.totalReturn)} e comprar e segurar fez ${formatPercent(withCosts.benchmarkReturn)} (diferença ${formatPercent(withCosts.excessReturn)}). Em **${stats.belowBenchmark} de ${stats.windows} janelas** a estratégia ficou abaixo de comprar e segurar. Para contexto, comprar e segurar de ${formatDate(scenario.periodStart)} até ${formatDate(scenario.periodEnd)} (o período todo, não só os meses de teste, sem custos) teria feito ${formatPercent(scenario.buyAndHoldWholePeriod)}.`,
    '',
  ];
}

function describeReasons(reasons: readonly string[]): string {
  if (reasons.length === 0) return 'nenhum critério de alerta foi atingido';
  return reasons.map((reason) => OVERFITTING_REASON_TEXT[reason] ?? reason).join('; ');
}

function renderSilentAlertNote(scenario: ScenarioReport): string[] {
  const inSample = scenario.withCosts.overfitting.inSampleSharpe;
  if (inSample !== null && Number(inSample) > 0) return [];
  return [
    '**Atenção ao alerta apagado:** o alerta só compara o teste com um ganho que existisse no ajuste. Aqui o melhor parâmetro de cada janela já não ganhava nem dentro da amostra (Sharpe no ajuste zero ou negativo). Alerta apagado, neste caso, **não indica robustez**: indica ausência de vantagem desde o ajuste.',
    '',
  ];
}

export function renderOverfitting(scenario: ScenarioReport): string[] {
  const { overfitting } = scenario.withCosts;
  const stats = computeWindowStats(scenario.withCosts.windows);
  return [
    `**${scenarioTitle(scenario)}: ${overfitting.isAlert ? 'ALERTA ACESO' : 'alerta apagado'}.** Sharpe dentro da amostra: ${formatNumber(overfitting.inSampleSharpe, 2)}; fora da amostra: ${formatNumber(overfitting.outOfSampleSharpe, 2)}; razão fora ÷ dentro: ${formatNumber(overfitting.degradation, 2)}. Motivos: ${describeReasons(overfitting.reasons)}.`,
    '',
    `Em **${stats.lostOutOfSample} de ${stats.eligibleWindows} janelas** com parâmetro elegível, o parâmetro vencedor tinha Sharpe positivo no ajuste e **perdeu dinheiro** no teste seguinte. Janelas com algum parâmetro elegível: ${overfitting.eligibleWindows} de ${overfitting.totalWindows}.`,
    '',
    ...renderSilentAlertNote(scenario),
    `Em ${countEdgeWindows(scenario.withCosts.windows)} de ${stats.windows} janelas pelo menos um parâmetro vencedor ficou na **borda da grade** (o menor ou o maior valor testado): isso sugere que a grade pode não conter o melhor valor, e que o "vencedor" é só o menos ruim entre as opções oferecidas.`,
    '',
  ];
}

function describeCostGap(gap: number): string {
  const tail =
    'O slippage não aparece na coluna de taxas: está embutido no preço de execução. Cada rodada escolhe seus próprios parâmetros, então a diferença mistura custo e escolha diferente.';
  if (gap >= 0) {
    return `Os custos tiraram cerca de ${formatPercent(String(gap))} (pontos percentuais) do retorno. ${tail}`;
  }
  return `Aqui o resultado com custos ficou ${formatPercent(String(-gap))} (pontos percentuais) _melhor_ que sem custos. Isso não é efeito dos custos, que só pioram uma mesma carteira: é a escolha de parâmetros diferentes em cada rodada, com poucas operações. ${tail}`;
}

export function renderCosts(scenario: ScenarioReport): string[] {
  const rows = [
    ['Com custos (taxa 0,1% + slippage 0,05%)', scenario.withCosts],
    ['Sem custos (taxa 0 e slippage 0)', scenario.withoutCosts],
  ] as const;
  const table = markdownTable(
    ['Cenário', 'Retorno fora da amostra', 'Operações', 'Taxas pagas (US$)', 'Sharpe'],
    rows.map(([label, run]) => [
      label,
      formatPercent(run.totalReturn),
      String(run.trades),
      formatNumber(run.feesPaid, 2),
      formatNumber(run.sharpe, 2),
    ]),
  );
  const gap = Number(scenario.withoutCosts.totalReturn) - Number(scenario.withCosts.totalReturn);
  return [`**${scenarioTitle(scenario)}.**`, '', ...table, describeCostGap(gap), ''];
}

export function renderSensitivity(scenario: ScenarioReport): string[] {
  const base = scenario.neighbors.find((neighbor) => neighbor.changedPath === null);
  if (base === undefined) return [];
  const baseReturn = Number(base.summary.totalReturn);
  const others = scenario.neighbors.filter((neighbor) => neighbor.changedPath !== null);
  const rows = scenario.neighbors.map((neighbor) => [
    neighbor.label,
    formatPercent(neighbor.summary.totalReturn),
    formatPercent(String(Number(neighbor.summary.totalReturn) - baseReturn)),
    String(neighbor.summary.trades),
    String(neighbor.summary.windows.filter((window) => !window.isEligible).length),
  ]);
  const positive = others.filter((neighbor) => Number(neighbor.summary.totalReturn) > 0).length;
  const big = others.filter(
    (neighbor) =>
      Math.abs(Number(neighbor.summary.totalReturn) - baseReturn) >= SENSITIVITY_HIGHLIGHT,
  ).length;
  return [
    `**${scenarioTitle(scenario)}.** Cada linha roda as mesmas janelas com os parâmetros de fábrica, trocando só um parâmetro por um valor vizinho da grade (sem escolher nada no ajuste).`,
    '',
    ...markdownTable(
      [
        'Configuração',
        'Retorno fora da amostra',
        'Diferença (pontos %)',
        'Operações',
        'Janelas paradas',
      ],
      rows,
    ),
    `Vizinhos com retorno positivo: **${positive} de ${others.length}** (a configuração de fábrica fez ${formatPercent(base.summary.totalReturn)}). Em **${big} de ${others.length}** vizinhos o retorno mudou 5 pontos percentuais ou mais em relação à configuração de fábrica. Quando um passo pequeno num parâmetro muda muito o resultado, o resultado depende da sorte do valor escolhido e não de uma regra robusta.`,
    '',
  ];
}
