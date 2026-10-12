// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatNumber, formatPercent } from './format-values.js';
import { scenarioTitle } from './render-sections.js';
import type { ScenarioReport } from './report.types.js';
import { computeWindowStats } from './window-stats.js';

function silentAlertSuffix(scenario: ScenarioReport): string {
  const { overfitting } = scenario.withCosts;
  const inSample = overfitting.inSampleSharpe;
  if (overfitting.isAlert || (inSample !== null && Number(inSample) > 0)) return '';
  return ' (apagado porque o melhor parâmetro já não ganhava no ajuste: isso não indica robustez)';
}

function summarizeScenario(scenario: ScenarioReport): string[] {
  const { withCosts, withoutCosts } = scenario;
  const stats = computeWindowStats(withCosts.windows);
  const alert = withCosts.overfitting.isAlert ? 'aceso' : 'apagado';
  return [
    `- **${scenarioTitle(scenario)}:** fora da amostra, a estratégia fez ${formatPercent(withCosts.totalReturn)} líquido de custos contra ${formatPercent(withCosts.benchmarkReturn)} de comprar e segurar nos mesmos meses; ${stats.positiveWindows} de ${stats.windows} janelas terminaram positivas.`,
    `- ${scenarioTitle(scenario)}: ${withCosts.trades} operações, taxa de acerto ${formatPercent(withCosts.winRate, 1)}, queda máxima ${formatPercent(withCosts.maxDrawdownDepth)}; Sharpe fora da amostra ${formatNumber(withCosts.sharpe, 2)}.`,
    `- ${scenarioTitle(scenario)}: alerta de overfitting **${alert}**${silentAlertSuffix(scenario)}; em ${stats.lostOutOfSample} de ${stats.eligibleWindows} janelas elegíveis o parâmetro vencedor no ajuste perdeu dinheiro no teste. Sem custos o retorno seria ${formatPercent(withoutCosts.totalReturn)}.`,
  ];
}

export function renderExecutiveSummary(scenarios: readonly ScenarioReport[]): string[] {
  return [
    '## Resumo para quem decide',
    '',
    ...scenarios.flatMap(summarizeScenario),
    '- Este relatório descreve o passado com dinheiro fictício. Não é recomendação de investimento e não promete resultado futuro (ver "O que isto NÃO prova").',
    '',
  ];
}
