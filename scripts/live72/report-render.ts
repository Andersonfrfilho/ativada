// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { RunCounts } from './run-counts.js';
import type { ReportData } from './report-types.js';

const NOT_AVAILABLE = 'n/d';

function percent(value: string | null): string {
  return value === null ? NOT_AVAILABLE : `${value}%`;
}

function money(value: string | null): string {
  return value === null ? NOT_AVAILABLE : value;
}

function formatCounts(counts: RunCounts | null): string {
  if (counts === null) return NOT_AVAILABLE;
  return `sinais ${counts.signals}, ordens ${counts.orders}, preenchimentos ${counts.fills}, posições ${counts.positions}, pontos de patrimônio ${counts.equityPoints}, alertas ${counts.alerts}`;
}

function renderHeader(data: ReportData): string[] {
  return [
    '# Relatório T6.3 — simulação ao vivo de 72 h',
    '',
    `**Veredito do critério 4: ${data.verdict}**`,
    ...data.reasons.map((reason) => `- ${reason}`),
    '',
    `Gerado em ${data.generatedAt}. Simulação com dados reais da Binance e dinheiro fictício.`,
    '',
  ];
}

function renderDuration(data: ReportData): string[] {
  const { run, events } = data;
  return [
    '## Duração',
    `- Execução ${run.runId} (${run.symbol} ${run.timeframe}), estratégia ${run.strategyName} v${run.strategyVersion} (hash ${run.configHash}).`,
    `- Início ${run.startedAt}; término previsto ${run.plannedEndAt}; janela analisada até ${data.windowEndAt} (${data.elapsedHours} h, ${data.isWindowComplete ? 'completa' : 'INCOMPLETA'}).`,
    `- Status no banco: ${data.database.runStatus}; esperando dados: ${data.database.isWaitingForData ? 'sim' : 'não'}.`,
    `- Supervisor iniciado ${events.supervisorStarts} vez(es), parado ${events.supervisorStops}; saídas de processo: ${JSON.stringify(events.childExits)}.`,
    `- Rotinas do cron: ${events.cronRuns} (${events.cronFailures} com falha).`,
    '',
  ];
}

function renderIntervention(data: ReportData): string[] {
  const { interventions } = data.events;
  const lines = ['## Intervenção humana'];
  if (interventions.length === 0)
    lines.push('- Nenhum comando fora do supervisor durante a execução.');
  for (const item of interventions) lines.push(`- ${item.at}: make live72 (${item.command})`);
  if (data.invalidEventLines > 0)
    lines.push(`- ${data.invalidEventLines} linha(s) ilegível(is) em events.jsonl.`);
  return [...lines, ''];
}

function renderRestart(data: ReportData): string[] {
  const { restart } = data;
  const lines = ['## Reinício controlado do worker'];
  if (!restart.isFired) return [...lines, '- Não aconteceu (nada a comparar).', ''];
  lines.push(`- SIGKILL no worker em ${restart.firedAt ?? NOT_AVAILABLE}.`);
  lines.push(`- Antes: ${formatCounts(restart.before)}.`);
  lines.push(`- Depois (agora): ${formatCounts(restart.after)}.`);
  lines.push(
    `- Candles avaliados depois do reinício: ${restart.evaluatedAfterKill ?? NOT_AVAILABLE}.`,
  );
  lines.push(`- Contagens que encolheram: ${restart.shrunkFields.join(', ') || 'nenhuma'}.`);
  const { duplicates } = data.database;
  lines.push(
    `- Duplicados por chave única — sinais ${duplicates.signals}, ordens ${duplicates.orders}, preenchimentos ${duplicates.fills}, patrimônio ${duplicates.equityPoints}, alertas ${duplicates.alerts}.`,
  );
  return [...lines, ''];
}

function renderCandles(data: ReportData): string[] {
  const { stats } = data;
  const samples = stats.missingSamples.map((openTime) => new Date(openTime).toISOString());
  return [
    '## Candles',
    `- Esperados ${stats.expectedCandles}, avaliados ${stats.evaluatedCandles}, buracos ${stats.missingCandles}${samples.length > 0 ? ` (ex.: ${samples.join(', ')})` : ''}.`,
    '',
  ];
}

function renderEquity(data: ReportData): string[] {
  const { stats } = data;
  return [
    '## Patrimônio',
    `- Inicial ${stats.initialEquity}; final ${money(stats.finalEquity)}; máximo ${money(stats.highestEquity)}; mínimo (no vale) ${money(stats.lowestEquityAtLow)}.`,
    `- Drawdown máximo (no vale): ${percent(stats.maxDrawdownPercent)}.`,
    `- Estratégia ${percent(stats.strategyReturnPercent)} contra comprar e segurar ${percent(stats.buyAndHoldReturnPercent)} no mesmo período (diferença ${stats.differencePercent ?? NOT_AVAILABLE} pontos percentuais). Janela curta: não é evidência de desempenho.`,
    '',
  ];
}

function renderAlerts(data: ReportData): string[] {
  const { database } = data;
  const lines = [
    '## Alertas',
    `- Sinais BUY/SELL: ${database.actionableSignals}; alertas gerados: ${database.counts.alerts}; por situação: ${JSON.stringify(database.alertsByStatus)}.`,
    '- Entrega: sumidouro local do Telegram (o Telegram real nunca foi chamado).',
  ];
  for (const sample of database.alertSample) {
    lines.push(
      `- ${new Date(sample.candleTime).toISOString()} ${sample.side} ${sample.symbol} a ${sample.closePrice}, pontuação ${sample.score}, ação simulada ${sample.simulatedAction}, ${sample.status}`,
    );
  }
  return [...lines, ''];
}

function renderErrors(data: ReportData): string[] {
  const entries = Object.entries(data.logErrors);
  const lines = ['## Erros nos logs (por código)'];
  if (entries.length === 0) lines.push('- Nenhum erro registrado.');
  for (const [code, count] of entries.sort((left, right) => right[1] - left[1])) {
    lines.push(`- ${code}: ${count}`);
  }
  return [...lines, ''];
}

export function renderReport(data: ReportData): string {
  return [
    ...renderHeader(data),
    ...renderDuration(data),
    ...renderIntervention(data),
    ...renderRestart(data),
    ...renderCandles(data),
    ...renderEquity(data),
    ...renderAlerts(data),
    ...renderErrors(data),
  ].join('\n');
}
