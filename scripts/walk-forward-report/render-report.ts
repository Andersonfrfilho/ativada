// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatDate } from './format-values.js';
import { COSTS_NOTE } from './render-constants.js';
import {
  renderBenchmark,
  renderCosts,
  renderOverfitting,
  renderResults,
  renderSensitivity,
  scenarioTitle,
} from './render-sections.js';
import { GLOSSARY, LIMITATION, NOT_PROVEN } from './render-static.js';
import { renderExecutiveSummary } from './render-summary.js';
import { REPORT_GRID, STEP_MONTHS, TEST_MONTHS, TRAIN_MONTHS } from './report.constant.js';
import type { ReportInput, ScenarioReport } from './report.types.js';

function describeGrid(): string[] {
  return REPORT_GRID.parameters.map(
    (parameter) => `  - \`${parameter.path}\`: ${parameter.values.join(', ')}`,
  );
}

function renderWhatWasTested(input: ReportInput): string[] {
  const first = input.scenarios[0];
  return [
    '## O que foi testado',
    '',
    `- **Estratégia:** o "Placar clássico" de fábrica: quatro votos (cruzamento de médias EMA, MACD, RSI e volume OBV) ponderados pelo regime de mercado (ADX); compra com pontuação a partir de +2, vende a partir de −2, stop de 2× ATR e alvo de 3× ATR, risco de 1% do saldo por operação.`,
    `- **Método:** walk-forward. A cada passo, o sistema escolhe, entre ${first?.combinations ?? 0} combinações da grade abaixo, a que teve o melhor Sharpe nos ${TRAIN_MONTHS} meses de ajuste e a aplica nos ${TEST_MONTHS} meses seguintes, que ele ainda não viu; depois anda ${STEP_MONTHS} meses e repete. O resultado principal é só o dos meses de teste emendados.`,
    '- **Grade de parâmetros** (catálogo fechado do produto):',
    ...describeGrid(),
    `- **Custos:** ${COSTS_NOTE}`,
    '- **Dados:** velas (candles) reais da Binance guardadas na base da simulação ao vivo, dos últimos 2 anos; consulta somente leitura. O mínimo de operações exigido no ajuste, por série, está em "Rastreabilidade".',
    '',
    ...GLOSSARY,
  ];
}

function renderEach(
  scenarios: readonly ScenarioReport[],
  render: (scenario: ScenarioReport) => string[],
): string[] {
  return scenarios.flatMap(render);
}

function renderTraceability(input: ReportInput): string[] {
  const rows = input.scenarios.map(
    (scenario) =>
      `| ${scenarioTitle(scenario)} | ${scenario.candleCount} | ${formatDate(scenario.firstOpenTime)} a ${formatDate(scenario.lastCloseTime)} | \`${scenario.digest}\` | ${scenario.minTradesPerWindow} | ${Math.round(scenario.elapsedSeconds)} s |`,
  );
  return [
    '## Rastreabilidade',
    '',
    '| Série | Candles | Período dos dados | SHA-256 dos candles | Mín. de operações no ajuste | Tempo de execução |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    `- **Commit do código:** \`${input.commit}\`${input.isTreeClean ? '' : ' (a árvore de código NÃO estava limpa ao gerar: o relatório não é reproduzível por esse commit)'}.`,
    input.isTreeClean
      ? '- A árvore de código estava limpa ao gerar.'
      : '- Atenção: a árvore de código NÃO estava limpa ao gerar.',
    `- **Versões do motor:** ${input.engineVersions}.`,
    `- **Dados até:** ${input.dataUntil}. **Gerado em:** ${input.generatedAt}.`,
    '- O hash cobre, na ordem, símbolo, timeframe, abertura, fechamento, abertura/máxima/mínima/fechamento e volume de cada candle usado. Recalcular o hash sobre os mesmos candles prova que o dado não mudou.',
    '- Reprodução: `scripts/walk-forward-report.ts` (somente leitura na base de origem); o módulo executado é o mesmo walk-forward de produção da API, numa base descartável.',
    '',
  ];
}

export function renderReport(input: ReportInput): string {
  const lines = [
    '# Relatório de walk-forward do Placar clássico (T6.4)',
    '',
    '> Simulação com dados do passado e dinheiro fictício. Não é recomendação de investimento nem promessa de resultado.',
    '',
    ...renderExecutiveSummary(input.scenarios),
    ...renderWhatWasTested(input),
    '## Resultado fora da amostra',
    '',
    ...renderEach(input.scenarios, renderResults),
    '## Comparação com comprar e segurar',
    '',
    ...renderEach(input.scenarios, renderBenchmark),
    '## Alerta de overfitting',
    '',
    ...renderEach(input.scenarios, renderOverfitting),
    '## Impacto dos custos',
    '',
    ...renderEach(input.scenarios, renderCosts),
    '## Sensibilidade a parâmetros vizinhos',
    '',
    ...renderEach(input.scenarios, renderSensitivity),
    ...LIMITATION,
    ...NOT_PROVEN,
    ...renderTraceability(input),
  ];
  return `${lines.join('\n').trimEnd()}\n`;
}
