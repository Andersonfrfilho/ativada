// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { computeWilsonInterval } from '../packages/statistics/src/index.js';
import {
  computeStrategyLeadInCandles,
  toEngineDecimal,
} from '../packages/strategy-engine/src/index.js';
import type {
  JobResult,
  SimulationSummary,
  WindowResult,
} from '../scripts/analyst-counterfactual/counterfactual.types.js';
import { COUNTERFACTUAL_STRATEGIES, runJob } from '../scripts/analyst-counterfactual/job.js';
import {
  describeVerdict,
  formatNumber,
  formatPercent,
  renderReport,
} from '../scripts/analyst-counterfactual/render.js';
import {
  computeWindows,
  judgeWindows,
  MINIMUM_COUNTED_WINDOWS,
  WINDOW_MILLISECONDS,
  WINDOW_VERDICT,
} from '../scripts/analyst-counterfactual/window-verdict.js';
import {
  ANALYST_REAL_DATASET,
  ANALYST_REAL_SENTIMENT,
} from './fixtures/live/analyst-real-data.fixture.js';
import { classicSetup, runReference } from './fixtures/live/live-scenarios.fixture.js';

// T2.4 da spec 007: o contrafactual em memória. A estratégia sozinha é o passo do produto, o analista só entra pelos
// comandos que o motor já tem, o veredito D11 sai do Wilson único e NADA é gravado (o script só lê).

const CANDLE = 900_000;
const PERIOD_START = 1_700_000_000_000;

function window(index: number, delta: string): WindowResult {
  return {
    index,
    startTime: PERIOD_START + index * WINDOW_MILLISECONDS,
    baselineNet: '0',
    analystNet: delta,
    delta,
  };
}

function windows(params: { helped: number; hurt: number; ties: number }): WindowResult[] {
  const deltas = [
    ...Array.from({ length: params.helped }, () => '1.5'),
    ...Array.from({ length: params.hurt }, () => '-2'),
    ...Array.from({ length: params.ties }, () => '0'),
  ];
  return deltas.map((delta, index) => window(index, delta));
}

describe('veredito D11 sobre janelas de 7 dias', () => {
  test('abaixo de 20 semanas com diferença o veredito é "poucas semanas", mesmo ganhando todas', () => {
    const judgement = judgeWindows(windows({ helped: 19, hurt: 0, ties: 7 }));
    expect(judgement.verdict).toBe(WINDOW_VERDICT.TOO_FEW);
    expect(judgement.counted).toBe(19);
    expect(judgement.ties).toBe(7);
    expect(judgement.lower).toBeNull();
    expect(MINIMUM_COUNTED_WINDOWS).toBe(20);
  });

  test('empate de semana não conta: 20 à frente e 6 iguais já dão o veredito', () => {
    const judgement = judgeWindows(windows({ helped: 20, hurt: 0, ties: 6 }));
    expect(judgement.counted).toBe(20);
    expect(judgement.verdict).toBe(WINDOW_VERDICT.HELPED);
  });

  test.each([
    [20, 0, WINDOW_VERDICT.HELPED],
    [16, 4, WINDOW_VERDICT.HELPED],
    [14, 6, WINDOW_VERDICT.EVEN],
    [10, 10, WINDOW_VERDICT.EVEN],
    [6, 14, WINDOW_VERDICT.EVEN],
    [4, 16, WINDOW_VERDICT.HURT],
    [0, 20, WINDOW_VERDICT.HURT],
  ])('%i à frente e %i atrás: %s', (helped, hurt, verdict) => {
    const judgement = judgeWindows(windows({ helped, hurt, ties: 0 }));
    expect(judgement.verdict).toBe(verdict);
    const interval = computeWilsonInterval({ successes: helped, total: helped + hurt });
    expect({ lower: judgement.lower, upper: judgement.upper }).toStrictEqual(interval);
  });

  test('o veredito segue o limite inferior e o superior contra 50%, não a contagem simples', () => {
    const lowerEdge = judgeWindows(windows({ helped: 15, hurt: 5, ties: 0 }));
    const lower = toEngineDecimal(lowerEdge.lower ?? '0');
    expect(lowerEdge.verdict === WINDOW_VERDICT.HELPED).toBe(lower.gt('0.5'));
  });

  test('as frases dizem ajudou, atrapalhou, empatou ou poucas semanas, com os números', () => {
    expect(describeVerdict(judgeWindows(windows({ helped: 20, hurt: 0, ties: 0 })))).toContain(
      'ajudou: terminou à frente em 20 de 20 semanas',
    );
    expect(describeVerdict(judgeWindows(windows({ helped: 0, hurt: 20, ties: 0 })))).toContain(
      'atrapalhou: terminou à frente em só 0 de 20 semanas',
    );
    expect(describeVerdict(judgeWindows(windows({ helped: 10, hurt: 10, ties: 0 })))).toContain(
      'empatou',
    );
    expect(describeVerdict(judgeWindows(windows({ helped: 3, hurt: 2, ties: 0 })))).toContain(
      'poucas semanas: só 5 com diferença',
    );
  });
});

describe('janelas de 7 dias', () => {
  const point = (
    candleTime: number,
    equity: string,
  ): { candleTime: number; equity: string; equityAtLow: string } => ({
    candleTime,
    equity,
    equityAtLow: equity,
  });

  test('o líquido de cada semana é o patrimônio ao fim dela menos o do fim da anterior (ou o saldo inicial)', () => {
    const week = WINDOW_MILLISECONDS;
    const baseline = [
      point(PERIOD_START, '10010'),
      point(PERIOD_START + week - CANDLE, '10100'),
      point(PERIOD_START + week, '10090'),
      point(PERIOD_START + 2 * week - CANDLE, '10050'),
    ];
    const analyst = [
      point(PERIOD_START, '10000'),
      point(PERIOD_START + week - CANDLE, '10040'),
      point(PERIOD_START + week, '10040'),
      point(PERIOD_START + 2 * week - CANDLE, '10300'),
    ];
    const result = computeWindows({
      baseline,
      analyst,
      initialBalance: '10000',
      periodStart: PERIOD_START,
      periodEnd: PERIOD_START + 2 * week - CANDLE,
      candleMilliseconds: CANDLE,
    });
    expect(result.map((item) => [item.baselineNet, item.analystNet, item.delta])).toStrictEqual([
      ['100', '40', '-60'],
      ['-50', '260', '310'],
    ]);
  });

  test('sobra menor que 7 dias no fim não vira janela; 183 dias dão 26 janelas', () => {
    const result = computeWindows({
      baseline: [],
      analyst: [],
      initialBalance: '10000',
      periodStart: PERIOD_START,
      periodEnd: PERIOD_START + 183 * 96 * CANDLE - CANDLE,
      candleMilliseconds: CANDLE,
    });
    expect(result.length).toBe(26);
    expect(result.every((item) => item.delta === '0')).toBe(true);
  });
});

describe('texto do relatório', () => {
  test('número em pt-BR: vírgula, milhar, menos tipográfico e meio para cima na exibição', () => {
    expect(formatNumber(toEngineDecimal('-1234.5'), 2)).toBe('−1.234,50');
    expect(formatNumber(toEngineDecimal('0'), 2)).toBe('0,00');
    expect(formatNumber(toEngineDecimal('0.005'), 2)).toBe('0,01');
    expect(formatNumber(toEngineDecimal('-0.004'), 2)).toBe('0,00');
    expect(formatPercent(toEngineDecimal('-0.2884'))).toBe('−28,84%');
  });

  test('o relatório lista os 8 casos, o veredito e a soma, sem esconder o que piora', () => {
    const summary = (
      finalEquity: string,
      feesPaid: string,
      entries: number,
    ): SimulationSummary => ({
      entries,
      closedPositions: entries,
      feesPaid,
      finalEquity,
      maxDrawdownAtLow: '0.1',
    });
    const job = (symbol: string, delta: string): JobResult => ({
      symbol,
      strategy: 'classic',
      strategyLabel: 'Placar clássico',
      initialBalance: '10000',
      periodStart: PERIOD_START,
      periodEnd: PERIOD_START + 1000 * CANDLE,
      candles: 17_568,
      baseline: summary('9000', '2000', 300),
      withAnalyst: summary(toEngineDecimal('9000').plus(delta).toString(), '500', 40),
      tally: {
        decisions: 100,
        failed: 0,
        postures: { pause: 80, caution: 10, normal: 5, confident: 5 },
        reasons: { move_cost: 70, quiet_market: 10 },
        gateClosed: 90,
        commands: { halt: 12 },
      },
      windows: windows({
        helped: delta.startsWith('-') ? 2 : 18,
        hurt: delta.startsWith('-') ? 18 : 2,
        ties: 6,
      }),
    });
    const text = renderReport([job('LINKUSDT', '500'), job('BNBUSDT', '-300')]);
    expect(text).toContain('LINKUSDT | Placar clássico | −1.000,00 (−10,00%) | −500,00 (−5,00%)');
    expect(text).toContain('ajudou');
    expect(text).toContain('atrapalhou');
    expect(text).toContain('Taxas poupadas');
    expect(text).toContain('260');
    expect(text).toContain('Dos 2 casos');
    expect(text).toContain('ajudou em 1, atrapalhou em 1');
    expect(text).toContain('Falhas do analista: 0');
    expect(text).toContain('negativo em 2, ou seja, pior que não operar (líquido zero) em 2');
  });
});

describe('a execução em memória', () => {
  const periodCandles = 900;
  const pair = {
    market: ANALYST_REAL_DATASET.market,
    candles: ANALYST_REAL_DATASET.candles,
    observations: ANALYST_REAL_SENTIMENT,
  };
  const ready = runJob({ pair, strategy: 'classic', periodCandles });

  test('a estratégia sozinha é o passo do produto: o patrimônio e as entradas batem com o laço direto do motor', async () => {
    const result = await ready;
    const leadIn = computeStrategyLeadInCandles(COUNTERFACTUAL_STRATEGIES.classic.version.config);
    const firstIndex = pair.candles.length - periodCandles - leadIn + 1;
    const reference = runReference({
      setup: classicSetup(ANALYST_REAL_DATASET),
      candles: pair.candles.slice(firstIndex),
    });
    const equityRows = reference.rows['equityPoints'] ?? [];
    const lastRow = equityRows.at(-1);
    const finalEquity =
      lastRow === undefined
        ? ''
        : (Object.getOwnPropertyDescriptor(lastRow, 'equity')?.value as string);
    expect(toEngineDecimal(result.baseline.finalEquity).eq(finalEquity)).toBe(true);
    expect(result.baseline.entries).toBe((reference.rows['positions'] ?? []).length);
    expect(result.periodStart).toBe(
      pair.candles[pair.candles.length - periodCandles]?.openTime ?? 0,
    );
  });

  test('o analista GOVERNA em toda vela, sem falha: pausa é escala 0 (nunca halt) e o único comando é a saída por tempo', async () => {
    const result = await ready;
    const leadIn = computeStrategyLeadInCandles(COUNTERFACTUAL_STRATEGIES.classic.version.config);
    expect(result.tally.decisions).toBe(periodCandles + leadIn - 1);
    expect(result.tally.failed).toBe(0);
    expect(Object.keys(result.tally.commands).every((kind) => kind === 'exit_position')).toBe(true);
    expect(result.tally.gateClosed).toBeGreaterThan(0);
    expect(result.tally.postures['pause'] ?? 0).toBeGreaterThan(0);
    expect(result.windows.length).toBe(1);
  });

  test('os números do relatório são coerentes: queda entre 0 e 100%, posições fechadas até as abertas, taxas não negativas', async () => {
    const result = await ready;
    for (const summary of [result.baseline, result.withAnalyst]) {
      const drawdown = toEngineDecimal(summary.maxDrawdownAtLow);
      expect(drawdown.gte(0) && drawdown.lte(1)).toBe(true);
      expect(summary.closedPositions).toBeLessThanOrEqual(summary.entries);
      expect(toEngineDecimal(summary.feesPaid).gte(0)).toBe(true);
      expect(toEngineDecimal(summary.finalEquity).gt(0)).toBe(true);
    }
  });
});

describe('nada é gravado', () => {
  const SOURCES = [
    'scripts/analyst-counterfactual.ts',
    'scripts/analyst-counterfactual/counterfactual.types.ts',
    'scripts/analyst-counterfactual/job.ts',
    'scripts/analyst-counterfactual/render.ts',
    'scripts/analyst-counterfactual/simulation.ts',
    'scripts/analyst-counterfactual/window-verdict.ts',
    'scripts/risk-analyst-baseline/market-source.ts',
  ];
  const WRITES =
    /appendAnalystDecision|appendResults|appendAlerts|runInBatch|upsertCandles|transitionRun|createRun\(|saveCheckpoint|insertAnalystDecision|createRunBatchRepository|createAnalystDecisionRepository|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b|\bDROP\b|\bALTER\b/;

  test('o script e o leitor de mercado só leem: nenhuma escrita em runs, analyst_decisions ou qualquer tabela', async () => {
    const root = new URL('../', import.meta.url).pathname;
    for (const path of SOURCES) {
      const code = (await Bun.file(`${root}${path}`).text())
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      expect(WRITES.exec(code)?.[0] ?? `${path} sem escrita`).toBe(`${path} sem escrita`);
    }
  });
});

describe('a tradução da decisão', () => {
  test('o contrafactual usa a função pura do pacote e não tem tradução nem halt próprios', async () => {
    const root = new URL('../', import.meta.url).pathname;
    const code = await Bun.file(`${root}scripts/analyst-counterfactual/simulation.ts`).text();
    expect(code).toContain('toGovernInputs(');
    expect(code).not.toMatch(/COMMAND_KIND\.(HALT|RESUME)|decideShadowStep|ENGINE_REASON_OF/);
  });
});
