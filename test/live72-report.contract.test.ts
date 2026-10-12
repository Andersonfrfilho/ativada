// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { buildReport } from '../scripts/live72/report-builder.js';
import { renderReport } from '../scripts/live72/report-render.js';
import type { DatabaseFacts, ReportInput } from '../scripts/live72/report-types.js';
import type { EventSummary } from '../scripts/live72/live72-events.js';
import type { RunCounts } from '../scripts/live72/run-counts.js';
import type { RunFile } from '../scripts/live72/run-file.js';
import { computeSeriesStats, type SeriesPoint } from '../scripts/live72/series-stats.js';
import { decideVerdict, type VerdictInput } from '../scripts/live72/verdict.js';

const HOUR = 3_600_000;
const START = Date.parse('2026-10-12T14:20:00.000Z');
const PERIOD_START = Date.parse('2026-10-12T14:00:00.000Z');
const END = START + 72 * HOUR;

const RUN: RunFile = {
  runId: 'run-1',
  userId: 'user-1',
  goalId: 'goal-1',
  strategyName: 'Placar clássico',
  strategyVersionId: 'version-1',
  strategyVersion: 1,
  configHash: 'abc123',
  symbol: 'BTCUSDT',
  timeframe: '1h',
  initialBalance: '10000',
  periodStart: PERIOD_START,
  leadInCandles: 200,
  startedAt: new Date(START).toISOString(),
  plannedEndAt: new Date(END).toISOString(),
  plannedWorkerKillAt: new Date(START + 36 * HOUR).toISOString(),
};

function buildSeries(count: number, skip: readonly number[] = []): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  for (let index = 0; index < count; index += 1) {
    if (skip.includes(index)) continue;
    const equity = (10000 + index * 10).toString();
    points.push({
      candleTime: PERIOD_START + index * HOUR,
      equity,
      equityAtLow: (10000 + index * 10 - 5).toString(),
      benchmark: (10000 + index * 4).toString(),
    });
  }
  return points;
}

const COUNTS: RunCounts = {
  signals: 72,
  orders: 4,
  fills: 4,
  positions: 2,
  equityPoints: 72,
  alerts: 3,
  lastCandleTime: PERIOD_START + 71 * HOUR,
};
const KILL_COUNTS: RunCounts = { ...COUNTS, signals: 36, equityPoints: 36, alerts: 1 };

const EVENTS: EventSummary = {
  supervisorStarts: 1,
  supervisorStops: 0,
  childExits: { worker: 1 },
  controlledKill: { at: new Date(START + 36 * HOUR).toISOString(), before: KILL_COUNTS },
  interventions: [],
  cronRuns: 12,
  cronFailures: 0,
};

const FACTS: DatabaseFacts = {
  runStatus: 'running',
  runErrorCode: null,
  goalOutcome: null,
  finishedAt: null,
  isWaitingForData: false,
  counts: COUNTS,
  actionableSignals: 4,
  windowActionableSignals: 3,
  windowAlerts: 3,
  duplicates: { signals: 0, orders: 0, fills: 0, equityPoints: 0, alerts: 0 },
  series: buildSeries(72),
  evaluatedAfterKill: 36,
  alertsByStatus: { sent: 3 },
  alertSample: [],
};

function input(
  overrides: Partial<ReportInput> = {},
  facts: Partial<DatabaseFacts> = {},
): ReportInput {
  return {
    run: RUN,
    now: END + 3 * HOUR,
    events: EVENTS,
    invalidEventLines: 0,
    logErrors: {},
    database: { ...FACTS, ...facts },
    ...overrides,
  };
}

describe('live72: estatísticas da série', () => {
  const window = { periodStart: PERIOD_START, windowEnd: END, initialBalance: '10000' };

  test('72 candles seguidos: nenhum buraco, retorno e comparação exatos', () => {
    const stats = computeSeriesStats(buildSeries(72), window);
    expect(stats.expectedCandles).toBe(72);
    expect(stats.evaluatedCandles).toBe(72);
    expect(stats.missingCandles).toBe(0);
    expect(stats.finalEquity).toBe('10710');
    expect(stats.strategyReturnPercent).toBe('7.10');
    expect(stats.buyAndHoldReturnPercent).toBe('2.84');
    expect(stats.differencePercent).toBe('4.26');
    expect(stats.highestEquity).toBe('10710');
    expect(stats.lowestEquityAtLow).toBe('9995');
  });

  test('candle faltando no meio vira buraco e aparece com a hora', () => {
    const stats = computeSeriesStats(buildSeries(72, [10, 11]), window);
    expect(stats.evaluatedCandles).toBe(70);
    expect(stats.missingCandles).toBe(2);
    expect(stats.missingSamples).toEqual([PERIOD_START + 10 * HOUR, PERIOD_START + 11 * HOUR]);
  });

  test('ponto de aquecimento e ponto depois da janela não contam', () => {
    const extra: SeriesPoint[] = [
      { candleTime: PERIOD_START - HOUR, equity: '1', equityAtLow: '1', benchmark: '1' },
      { candleTime: PERIOD_START + 99 * HOUR, equity: '1', equityAtLow: '1', benchmark: '1' },
    ];
    const stats = computeSeriesStats([...extra, ...buildSeries(72)], window);
    expect(stats.evaluatedCandles).toBe(72);
    expect(stats.finalEquity).toBe('10710');
  });

  test('drawdown usa o pico do fechamento e o vale do candle', () => {
    const points: SeriesPoint[] = [
      { candleTime: PERIOD_START, equity: '10000', equityAtLow: '9990', benchmark: '10000' },
      {
        candleTime: PERIOD_START + HOUR,
        equity: '11000',
        equityAtLow: '10900',
        benchmark: '10000',
      },
      {
        candleTime: PERIOD_START + 2 * HOUR,
        equity: '10500',
        equityAtLow: '9900',
        benchmark: '10000',
      },
    ];
    const stats = computeSeriesStats(points, { ...window, windowEnd: PERIOD_START + 3 * HOUR });
    expect(stats.maxDrawdownPercent).toBe('-10.00');
  });

  test('sem nenhum ponto: tudo é buraco e os números ficam indisponíveis', () => {
    const stats = computeSeriesStats([], { ...window, windowEnd: PERIOD_START + 5 * HOUR });
    expect(stats.expectedCandles).toBe(5);
    expect(stats.missingCandles).toBe(5);
    expect(stats.finalEquity).toBeNull();
    expect(stats.strategyReturnPercent).toBeNull();
  });
});

const CLEAN: VerdictInput = {
  isWindowComplete: true,
  runStatus: 'running',
  runErrorCode: null,
  endedEarly: false,
  interventionCount: 0,
  duplicateTotal: 0,
  missingCandles: 0,
  isKillFired: true,
  evaluatedAfterKill: 36,
  isKillResumeDue: true,
  shrunkAfterKill: [],
  actionableSignals: 3,
  alertsGenerated: 3,
};

describe('live72: veredito do critério 4', () => {
  test('tudo limpo: APROVADO', () => {
    expect(decideVerdict(CLEAN).verdict).toBe('APROVADO');
  });

  test.each([
    ['execução falhou', { runStatus: 'failed' }],
    ['código de erro gravado', { runErrorCode: 'ENGINE_VERSION_MISMATCH' }],
    ['chave duplicada', { duplicateTotal: 1 }],
    ['buraco de candle', { missingCandles: 1 }],
    ['contagem encolheu', { shrunkAfterKill: ['signals'] }],
    ['worker não retomou', { evaluatedAfterKill: 0 }],
    ['sinal sem alerta', { alertsGenerated: 0 }],
  ] satisfies [string, Partial<VerdictInput>][])('REPROVADO: %s', (_name, change) => {
    expect(decideVerdict({ ...CLEAN, ...change }).verdict).toBe('REPROVADO');
  });

  test.each([
    ['72 h incompletas', { isWindowComplete: false }],
    ['terminou antes', { endedEarly: true }],
    ['intervenção humana', { interventionCount: 1 }],
    [
      'reinício não aconteceu',
      { isKillFired: false, isKillResumeDue: false, evaluatedAfterKill: null },
    ],
    ['nenhum sinal acionável', { actionableSignals: 0, alertsGenerated: 0 }],
  ] satisfies [string, Partial<VerdictInput>][])('INCONCLUSIVO: %s', (_name, change) => {
    expect(decideVerdict({ ...CLEAN, ...change }).verdict).toBe('INCONCLUSIVO');
  });

  test('reprovação vence a falta de conclusão e todos os motivos aparecem', () => {
    const result = decideVerdict({
      ...CLEAN,
      isWindowComplete: false,
      missingCandles: 2,
      duplicateTotal: 1,
    });
    expect(result.verdict).toBe('REPROVADO');
    expect(result.reasons).toHaveLength(2);
  });

  test('worker recém-morto (ainda sem 2 candles) não reprova', () => {
    const result = decideVerdict({ ...CLEAN, evaluatedAfterKill: 0, isKillResumeDue: false });
    expect(result.verdict).toBe('APROVADO');
  });
});

describe('live72: relatório completo', () => {
  test('72 h limpas viram APROVADO e o texto traz as seções pedidas', () => {
    const data = buildReport(input());
    expect(data.verdict).toBe('APROVADO');
    expect(data.isWindowComplete).toBe(true);
    expect(data.elapsedHours).toBe('72.0');
    const text = renderReport(data);
    for (const section of [
      '## Duração',
      '## Intervenção humana',
      '## Reinício controlado do worker',
      '## Candles',
      '## Patrimônio',
      '## Alertas',
      '## Erros nos logs',
    ]) {
      expect(text).toContain(section);
    }
    expect(text).toContain('Esperados 72, avaliados 72, buracos 0');
    expect(text).toContain('comprar e segurar 2.84%');
  });

  test('antes das 72 h a janela termina agora e o veredito é INCONCLUSIVO', () => {
    const now = START + 10 * HOUR;
    const data = buildReport(input({ now }, { series: buildSeries(10) }));
    expect(data.verdict).toBe('INCONCLUSIVO');
    expect(data.isWindowComplete).toBe(false);
    expect(data.stats.expectedCandles).toBe(10);
    expect(data.stats.evaluatedCandles).toBe(10);
  });

  test('comando humano antes do início da simulação não conta como intervenção', () => {
    const events: EventSummary = {
      ...EVENTS,
      interventions: [{ at: new Date(START - HOUR).toISOString(), command: 'up' }],
    };
    expect(buildReport(input({ events })).verdict).toBe('APROVADO');
  });

  test('comando humano durante a execução tira a aprovação e é listado', () => {
    const events: EventSummary = {
      ...EVENTS,
      interventions: [{ at: new Date(START + 5 * HOUR).toISOString(), command: 'stop' }],
    };
    const data = buildReport(input({ events }));
    expect(data.verdict).toBe('INCONCLUSIVO');
    expect(renderReport(data)).toContain('make live72 (stop)');
  });

  test('contagem de antes maior que a de depois é detectada pelo relatório', () => {
    const events: EventSummary = {
      ...EVENTS,
      controlledKill: {
        at: EVENTS.controlledKill?.at ?? '',
        before: { ...KILL_COUNTS, alerts: 99 },
      },
    };
    const data = buildReport(input({ events }));
    expect(data.restart.shrunkFields).toEqual(['alerts']);
    expect(data.verdict).toBe('REPROVADO');
  });

  test('erros dos logs aparecem agregados por código, do maior para o menor', () => {
    const text = renderReport(buildReport(input({ logErrors: { A_RARE: 1, B_COMMON: 7 } })));
    expect(text.indexOf('B_COMMON: 7')).toBeLessThan(text.indexOf('A_RARE: 1'));
  });

  test('só o alerta do aquecimento (candle antes da janela) não prova a geração de alertas', () => {
    const data = buildReport(
      input({}, { actionableSignals: 1, windowActionableSignals: 0, windowAlerts: 0 }),
    );
    expect(data.verdict).toBe('INCONCLUSIVO');
    expect(data.reasons.join(' ')).toContain('dentro da janela');
  });

  test('sinal de candle da janela sem alerta reprova mesmo havendo alerta do aquecimento', () => {
    const data = buildReport(input({}, { windowActionableSignals: 2, windowAlerts: 0 }));
    expect(data.verdict).toBe('REPROVADO');
  });

  test('execução encerrada antes do término previsto é INCONCLUSIVO', () => {
    const finishedAt = new Date(START + 5 * HOUR).toISOString();
    const data = buildReport(input({}, { runStatus: 'succeeded', finishedAt }));
    expect(data.verdict).toBe('INCONCLUSIVO');
  });
});
