// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EngineDecimal,
  toEngineDecimal,
  type EngineDecimalValue,
} from '../../packages/strategy-engine/src/index.js';
import type { JobResult, SimulationSummary } from './counterfactual.types.js';
import { judgeWindows, WINDOW_VERDICT, type WindowJudgement } from './window-verdict.js';

const MINUS = '−';
const PERCENT_PLACES = 2;
const HUNDRED = 100;
const POSTURES = ['pause', 'caution', 'normal', 'confident'] as const;
const POSTURE_LABEL: Readonly<Record<string, string>> = {
  pause: 'pausa',
  caution: 'cautela',
  normal: 'moderada',
  confident: 'liberada',
};

// Número em pt-BR: vírgula decimal, ponto de milhar e o sinal de menos tipográfico; meio para cima só na exibição.
export function formatNumber(value: EngineDecimalValue, places: number): string {
  const rounded = value.toDecimalPlaces(places, EngineDecimal.ROUND_HALF_UP);
  const [integer = '0', fraction] = rounded.abs().toFixed(places).split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const text = fraction === undefined ? grouped : `${grouped},${fraction}`;
  return rounded.isNegative() && !rounded.isZero() ? `${MINUS}${text}` : text;
}

export function formatPercent(rate: EngineDecimalValue): string {
  return `${formatNumber(rate.times(HUNDRED), PERCENT_PLACES)}%`;
}

export function netOf(summary: SimulationSummary, initialBalance: string): EngineDecimalValue {
  return toEngineDecimal(summary.finalEquity).minus(initialBalance);
}

function netRateOf(summary: SimulationSummary, initialBalance: string): EngineDecimalValue {
  return netOf(summary, initialBalance).dividedBy(initialBalance);
}

function share(part: number, total: number): string {
  if (total === 0) return '0,00%';
  return formatPercent(new EngineDecimal(part).dividedBy(total));
}

function resultRow(job: JobResult): string {
  const { baseline, withAnalyst, initialBalance, tally } = job;
  const baselineRate = netRateOf(baseline, initialBalance);
  const analystRate = netRateOf(withAnalyst, initialBalance);
  const savedFees = toEngineDecimal(baseline.feesPaid).minus(withAnalyst.feesPaid);
  return [
    job.symbol,
    job.strategyLabel,
    `${formatNumber(netOf(baseline, initialBalance), 2)} (${formatPercent(baselineRate)})`,
    `${formatNumber(netOf(withAnalyst, initialBalance), 2)} (${formatPercent(analystRate)})`,
    `${formatNumber(analystRate.minus(baselineRate).times(HUNDRED), PERCENT_PLACES)} p.p.`,
    formatNumber(toEngineDecimal(baseline.feesPaid), 2),
    formatNumber(toEngineDecimal(withAnalyst.feesPaid), 2),
    formatNumber(savedFees, 2),
    String(baseline.entries),
    String(withAnalyst.entries),
    String(baseline.entries - withAnalyst.entries),
    formatPercent(toEngineDecimal(baseline.maxDrawdownAtLow)),
    formatPercent(toEngineDecimal(withAnalyst.maxDrawdownAtLow)),
    share(tally.gateClosed, tally.decisions),
  ].join(' | ');
}

const RESULT_HEADER = [
  'Par',
  'Estratégia',
  'Líquido sem o analista (USDT)',
  'Líquido com o analista (USDT)',
  'Diferença',
  'Taxas sem',
  'Taxas com',
  'Taxas poupadas',
  'Operações sem',
  'Operações com',
  'Evitadas',
  'Maior queda sem',
  'Maior queda com',
  'Porta fechada',
];

function table(header: readonly string[], rows: readonly string[]): string {
  const separator = header.map(() => '---').join(' | ');
  return [`| ${header.join(' | ')} |`, `| ${separator} |`, ...rows.map((row) => `| ${row} |`)].join(
    '\n',
  );
}

export function describeVerdict(judgement: WindowJudgement): string {
  const { helped, counted, lower, upper } = judgement;
  const range =
    lower === null || upper === null
      ? ''
      : ` (Wilson 95%: ${formatPercent(toEngineDecimal(lower))} a ${formatPercent(toEngineDecimal(upper))})`;
  switch (judgement.verdict) {
    case WINDOW_VERDICT.HELPED:
      return `ajudou: terminou à frente em ${helped} de ${counted} semanas com diferença${range}, acima da moeda ao ar`;
    case WINDOW_VERDICT.HURT:
      return `atrapalhou: terminou à frente em só ${helped} de ${counted} semanas com diferença${range}, abaixo da moeda ao ar`;
    case WINDOW_VERDICT.EVEN:
      return `empatou: terminou à frente em ${helped} de ${counted} semanas com diferença${range}, o intervalo inclui a moeda ao ar`;
    default:
      return `poucas semanas: só ${counted} com diferença, o veredito pede ao menos 20`;
  }
}

const VERDICT_HEADER = [
  'Par',
  'Estratégia',
  'Semanas',
  'À frente',
  'Atrás',
  'Iguais',
  'Veredito (D11)',
];

function verdictRow(job: JobResult, judgement: WindowJudgement): string {
  return [
    job.symbol,
    job.strategyLabel,
    String(judgement.windows),
    String(judgement.helped),
    String(judgement.hurt),
    String(judgement.ties),
    describeVerdict(judgement),
  ].join(' | ');
}

function postureLine(job: JobResult): string {
  const { tally } = job;
  const parts = POSTURES.map(
    (posture) =>
      `${POSTURE_LABEL[posture] ?? posture} ${share(tally.postures[posture] ?? 0, tally.decisions)}`,
  );
  const reasons = Object.entries(tally.reasons)
    .sort((first, second) => second[1] - first[1])
    .slice(0, 4)
    .map(([reason, count]) => `${reason} ${count}`);
  const commands = Object.entries(tally.commands)
    .map(([kind, count]) => `${kind} ${count}`)
    .join(', ');
  return `- ${job.symbol} · ${job.strategyLabel}: ${parts.join(' · ')}. Motivos mais comuns: ${reasons.join(', ')}. Comandos: ${commands === '' ? 'nenhum' : commands}. Falhas do analista: ${tally.failed}.`;
}

function conclusion(judgements: readonly (readonly [JobResult, WindowJudgement])[]): string {
  const count = (verdict: string): number =>
    judgements.filter(([, judgement]) => judgement.verdict === verdict).length;
  const totalDelta = judgements.reduce(
    (sum, [job]) =>
      sum
        .plus(netOf(job.withAnalyst, job.initialBalance))
        .minus(netOf(job.baseline, job.initialBalance)),
    new EngineDecimal(0),
  );
  const positive = judgements.filter(([job]) =>
    netOf(job.withAnalyst, job.initialBalance).gt(0),
  ).length;
  const worseThanStandingStill = judgements.filter(([job]) =>
    netOf(job.withAnalyst, job.initialBalance).lt(0),
  ).length;
  return [
    `Dos ${judgements.length} casos (4 pares × 2 estratégias): ajudou em ${count(WINDOW_VERDICT.HELPED)}, atrapalhou em ${count(WINDOW_VERDICT.HURT)}, empatou em ${count(WINDOW_VERDICT.EVEN)} e ficou com poucas semanas em ${count(WINDOW_VERDICT.TOO_FEW)}.`,
    `Somando os ${judgements.length} casos, o líquido com o analista menos o líquido sem ele é ${formatNumber(totalDelta, 2)} USDT (saldo inicial de ${judgements[0]?.[0].initialBalance ?? ''} USDT por caso).`,
    `O veredito mede só se o analista perde MENOS que a estratégia sozinha, não se ganha: com o analista o líquido ficou positivo em ${positive} dos ${judgements.length} casos e negativo em ${worseThanStandingStill}, ou seja, pior que não operar (líquido zero) em ${worseThanStandingStill}.`,
  ].join(' ');
}

export function renderReport(jobs: readonly JobResult[]): string {
  const first = jobs[0];
  if (first === undefined) return 'Sem resultado.';
  const judgements = jobs.map((job) => [job, judgeWindows(job.windows)] as const);
  const lines = [
    `Período medido: ${new Date(first.periodStart).toISOString()} a ${new Date(first.periodEnd).toISOString()} (${first.candles} velas de 15 min, 183 dias), saldo inicial ${first.initialBalance} USDT, taxa 0,1% e slippage 0,05% por lado.`,
    '',
    table(RESULT_HEADER, jobs.map(resultRow)),
    '',
    table(
      VERDICT_HEADER,
      judgements.map(([job, judgement]) => verdictRow(job, judgement)),
    ),
    '',
    'Postura do analista nas velas (com o analista governando a carteira em memória):',
    '',
    ...jobs.map(postureLine),
    '',
    conclusion(judgements),
  ];
  return lines.join('\n');
}
