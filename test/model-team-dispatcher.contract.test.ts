// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { ClaimedTeamReport, FinishTeamReportParams } from '../packages/database/src/index.js';
import type { TeamRuntime } from '../apps/worker-ativada/src/model-teams/build-team-runtimes.js';
import { createReportDispatcher } from '../apps/worker-ativada/src/model-teams/report-dispatcher.js';
import { processReport } from '../apps/worker-ativada/src/model-teams/report-processor.js';
import type { ReportProcessorDependencies } from '../apps/worker-ativada/src/model-teams/report-processor.types.js';
import { createReportEnqueuer } from '../apps/worker-ativada/src/model-teams/report-scheduler.js';
import { buildProviderStatus } from '../apps/worker-ativada/src/model-teams/provider-status.js';
import { createTeamCircuits } from '../apps/worker-ativada/src/model-teams/team-circuits.js';
import type { WorkerLogger } from '../apps/worker-ativada/src/logging/worker-logger.js';
import {
  MODEL_CALL_STATUS,
  type ModelCallResult,
  type RequestTeamReportParams,
} from '../packages/model-agents/src/index.js';
import {
  FAKE_BUY_REPORT,
  FAKE_HOLD_REPORT,
} from '../packages/model-agents/test-support/fake-provider-payloads.js';

const SENTINEL = 'sk-test-SENTINEL';
const CANDLE_MILLISECONDS = 900_000;
const CANDLE_TIME = 1_700_000_100_000 - (1_700_000_100_000 % CANDLE_MILLISECONDS);
const NOW = CANDLE_TIME + CANDLE_MILLISECONDS + 5_000;
const LAST_CLOSE = '100.00';
const USAGE = { inputTokens: 3_200, outputTokens: 450, thinkingTokens: 0 };

type Harness = {
  readonly dependencies: ReportProcessorDependencies;
  readonly finishes: FinishTeamReportParams[];
  readonly logs: string[];
  readonly calls: RequestTeamReportParams[];
  setResult: (result: ModelCallResult) => void;
  setAllowedBudget: (isAllowed: boolean) => void;
};

function buildCandles(): readonly object[] {
  return Array.from({ length: 48 }, (_unused, index) => ({
    exchange: 'binance',
    symbol: 'LINKUSDT',
    timeframe: '15m',
    openTime: CANDLE_TIME - (47 - index) * CANDLE_MILLISECONDS,
    closeTime: CANDLE_TIME - (46 - index) * CANDLE_MILLISECONDS - 1,
    open: '100',
    high: '101',
    low: '99',
    close: LAST_CLOSE,
    volume: '10',
    tradeCount: 1,
  }));
}

function createHarness(
  options: { readonly now?: number; readonly rejectFinishNumber?: number } = {},
): Harness {
  let finishCount = 0;
  const finishes: FinishTeamReportParams[] = [];
  const logs: string[] = [];
  const calls: RequestTeamReportParams[] = [];
  const state = {
    result: { status: MODEL_CALL_STATUS.OK } as ModelCallResult,
    isAllowed: true,
  };
  state.result = okResult(FAKE_BUY_REPORT);
  const logger: WorkerLogger = {
    info: (message, fields) => logs.push(JSON.stringify({ message, ...fields })),
    warn: (message, fields) => logs.push(JSON.stringify({ message, ...fields })),
    error: (message, fields) => logs.push(JSON.stringify({ message, ...fields })),
  };
  const runtime: TeamRuntime = {
    teamKey: 'nina',
    provider: 'google',
    modelId: 'fake-model-1',
    price: { inputUsdPerMegaToken: '2', outputUsdPerMegaToken: '12' },
    maxThinkingTokens: 2_000,
    port: {
      requestTeamReport: (params) => {
        calls.push(params);
        return Promise.resolve(state.result);
      },
    },
  };
  const dependencies: ReportProcessorDependencies = {
    reports: {
      saveInput: () => Promise.resolve(),
      reserveBudget: (params) =>
        Promise.resolve({
          usage: { dayUsd: '0', monthUsd: '0' },
          isReserved: state.isAllowed && params.isAllowed({ dayUsd: '0', monthUsd: '0' }),
        }),
      finish: (params) => {
        finishCount += 1;
        if (finishCount === options.rejectFinishNumber)
          return Promise.reject(new Error('banco caiu'));
        finishes.push(params);
        return Promise.resolve();
      },
      readPublicReadings: () => Promise.resolve(undefined),
    },
    sources: {
      exchange: 'binance',
      candles: { findCandles: () => Promise.resolve(buildCandles() as never) },
      sentiment: { findAvailableAt: () => Promise.resolve(undefined) },
      reports: { readPublicReadings: () => Promise.resolve(undefined) },
    },
    runtimes: new Map([['nina', runtime]]),
    circuits: createTeamCircuits(),
    settings: {
      timeoutMilliseconds: 30_000,
      maxOutputTokens: 900,
      budget: { dailyUsd: '2', monthlyUsd: '50' },
      entryTolerancePercent: '1.5',
      minStopPercent: '0.2',
    },
    logger,
    now: () => options.now ?? NOW,
    signal: new AbortController().signal,
  };
  return {
    dependencies,
    finishes,
    logs,
    calls,
    setResult: (result): void => {
      state.result = result;
    },
    setAllowedBudget: (isAllowed): void => {
      state.isAllowed = isAllowed;
    },
  };
}

function okResult(report: typeof FAKE_BUY_REPORT): ModelCallResult {
  return { status: MODEL_CALL_STATUS.OK, report, usage: USAGE, latencyMilliseconds: 120 };
}

function claimed(overrides: Partial<ClaimedTeamReport> = {}): ClaimedTeamReport {
  return {
    id: crypto.randomUUID(),
    teamKey: 'nina',
    provider: 'google',
    modelId: 'fake-model-1',
    kind: 'scheduled',
    symbol: 'LINKUSDT',
    candleTime: CANDLE_TIME,
    attempt: 1,
    requestedAt: new Date(NOW),
    ...overrides,
  };
}

describe('processador de relatório de equipe', () => {
  test('caminho feliz: entrada pública, chamada, custo pelos tokens e linha decidida', async () => {
    const harness = createHarness();
    await processReport(harness.dependencies, claimed());
    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]?.prompt).toContain('LINKUSDT');
    const [finish] = harness.finishes;
    expect(finish?.status).toBe('decided');
    expect(finish?.decision?.action).toBe('buy');
    expect(finish?.decision?.entryPrice).toBe('100.00');
    // (3.200 × 2 + 450 × 12) ÷ 1.000.000 = 0,0118
    expect(finish?.costUsd).toBe('0.0118');
    expect(finish?.measure.latencyMilliseconds).toBe(120);
    expect(finish?.decision?.roles).toStrictEqual({
      trend: { stance: 'up', reason: FAKE_BUY_REPORT.trend.reason },
      risk: { level: 'medium', reason: FAKE_BUY_REPORT.risk.reason },
      decision: { reason: FAKE_BUY_REPORT.decision.reason },
    });
  });

  test('o prompt nunca leva dado de usuário nem chave', async () => {
    const harness = createHarness();
    await processReport(harness.dependencies, claimed());
    const prompt = harness.calls[0]?.prompt ?? '';
    expect(prompt).not.toContain(SENTINEL);
    expect(prompt).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/u);
    expect(prompt).not.toContain('@');
    expect(JSON.stringify(harness.logs)).not.toContain(SENTINEL);
  });

  test('palavra proibida no motivo é trocada pela frase fixa e marca o texto escondido', async () => {
    const harness = createHarness();
    const risky = {
      ...FAKE_BUY_REPORT,
      risk: { ...FAKE_BUY_REPORT.risk, reason: 'compre agora, é garantido' },
    };
    harness.setResult(okResult(risky));
    await processReport(harness.dependencies, claimed());
    const [finish] = harness.finishes;
    expect(finish?.decision?.isReasonHidden).toBe(true);
    expect(JSON.stringify(finish?.decision?.roles)).not.toContain('garantido');
  });

  test('preços incoerentes viram INVALID_LEVELS e o custo da chamada é gravado', async () => {
    const harness = createHarness();
    const incoherent = {
      ...FAKE_BUY_REPORT,
      decision: {
        ...FAKE_BUY_REPORT.decision,
        entryPrice: '130.00',
        targetPrice: '131',
        stopPrice: '129',
      },
    };
    harness.setResult(okResult(incoherent));
    await processReport(harness.dependencies, claimed());
    const [finish] = harness.finishes;
    expect(finish?.status).toBe('failed');
    expect(finish?.failureCode).toBe('INVALID_LEVELS');
    expect(finish?.costUsd).toBe('0.0118');
  });

  test('esperar (hold) é uma decisão válida sem preços', async () => {
    const harness = createHarness();
    harness.setResult(okResult(FAKE_HOLD_REPORT));
    await processReport(harness.dependencies, claimed());
    expect(harness.finishes[0]?.decision?.entryPrice).toBeNull();
    expect(harness.finishes[0]?.status).toBe('decided');
  });

  test('vela com mais de 2 de idade vira STALE e nunca chama o provedor', async () => {
    const harness = createHarness({ now: NOW + 3 * CANDLE_MILLISECONDS });
    await processReport(harness.dependencies, claimed());
    expect(harness.finishes[0]).toMatchObject({ status: 'skipped', failureCode: 'STALE' });
    expect(harness.calls).toHaveLength(0);
  });

  test('pedido avulso nunca expira por idade', async () => {
    const harness = createHarness({ now: NOW + 10 * CANDLE_MILLISECONDS });
    await processReport(harness.dependencies, claimed({ kind: 'on_demand' }));
    expect(harness.finishes[0]?.status).toBe('decided');
  });

  test('equipe sem chave vira NO_KEY, sem chamar nada', async () => {
    const harness = createHarness();
    await processReport(harness.dependencies, claimed({ teamKey: 'lucas' }));
    expect(harness.finishes[0]).toMatchObject({ status: 'skipped', failureCode: 'NO_KEY' });
    expect(harness.calls).toHaveLength(0);
  });

  test('teto de custo: BUDGET_EXHAUSTED, nenhuma chamada a mais', async () => {
    const harness = createHarness();
    harness.setAllowedBudget(false);
    await processReport(harness.dependencies, claimed());
    expect(harness.finishes[0]).toMatchObject({
      status: 'skipped',
      failureCode: 'BUDGET_EXHAUSTED',
    });
    expect(harness.calls).toHaveLength(0);
    const status = buildProviderStatus({
      runtimes: [...harness.dependencies.runtimes.values()],
      circuits: harness.dependencies.circuits,
      now: () => NOW,
    });
    expect((status as Record<string, { providerState: string }>)['nina']?.providerState).toBe(
      'budget_exhausted',
    );
  });

  test('3 falhas seguidas abrem o circuito; a 4ª vela vira CIRCUIT_OPEN sem chamada', async () => {
    const harness = createHarness();
    harness.setResult({ status: MODEL_CALL_STATUS.UNAVAILABLE });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await processReport(harness.dependencies, claimed());
    }
    expect(harness.finishes.map((finish) => finish.failureCode)).toStrictEqual([
      'UNAVAILABLE',
      'UNAVAILABLE',
      'UNAVAILABLE',
    ]);
    await processReport(harness.dependencies, claimed());
    expect(harness.finishes[3]).toMatchObject({ status: 'skipped', failureCode: 'CIRCUIT_OPEN' });
    expect(harness.calls).toHaveLength(3);
  });

  test('cada status de falha grava o código certo e leva os tokens quando o provedor os devolveu', async () => {
    const cases: readonly [ModelCallResult, string][] = [
      [
        { status: MODEL_CALL_STATUS.REFUSED, measure: { latencyMilliseconds: 5, ...USAGE } },
        'REFUSED',
      ],
      [
        { status: MODEL_CALL_STATUS.INVALID_OUTPUT, measure: { latencyMilliseconds: 5, ...USAGE } },
        'INVALID_OUTPUT',
      ],
      [{ status: MODEL_CALL_STATUS.TIMEOUT }, 'TIMEOUT'],
      [{ status: MODEL_CALL_STATUS.KEY_REJECTED }, 'KEY_REJECTED'],
      [{ status: MODEL_CALL_STATUS.MODEL_NOT_FOUND }, 'MODEL_NOT_FOUND'],
      [{ status: MODEL_CALL_STATUS.BAD_REQUEST }, 'BAD_REQUEST'],
      [{ status: MODEL_CALL_STATUS.RATE_LIMITED, retryAfterMilliseconds: 1_000 }, 'RATE_LIMITED'],
    ];
    for (const [result, code] of cases) {
      const harness = createHarness();
      harness.setResult(result);
      await processReport(harness.dependencies, claimed());
      expect(harness.finishes[0]).toMatchObject({ status: 'failed', failureCode: code });
      const hasTokens = 'measure' in result && result.measure?.inputTokens !== undefined;
      expect(harness.finishes[0]?.costUsd).toBe(hasTokens ? '0.0118' : '0');
    }
  });
});

describe('despachante', () => {
  test('erro numa linha não derruba as outras nem o ciclo; a concorrência vira o limite da reivindicação', async () => {
    const harness = createHarness({ rejectFinishNumber: 2 });
    const reports = [claimed(), claimed(), claimed()];
    let claimLimit = 0;
    const dispatcher = createReportDispatcher({
      processor: harness.dependencies,
      concurrency: 3,
      claims: {
        claimPending: (params) => {
          claimLimit = params.limit;
          return Promise.resolve(reports);
        },
      },
    });
    const summary = await dispatcher.tick();
    expect(claimLimit).toBe(3);
    expect(summary).toStrictEqual({ claimed: 3, errored: 1 });
    expect(harness.finishes).toHaveLength(2);
    expect(harness.logs.some((line) => line.includes('errored'))).toBe(true);
    expect(JSON.stringify(harness.logs)).not.toContain('banco caiu');
  });
});

describe('enfileirador', () => {
  function build(params: { readonly candleTime: number | undefined; readonly now: number }): {
    readonly enqueued: object[];
    readonly run: () => Promise<number>;
  } {
    const enqueued: object[] = [];
    const enqueuer = createReportEnqueuer({
      exchange: 'binance',
      symbols: ['LINKUSDT'],
      runtimes: [
        {
          teamKey: 'nina',
          provider: 'google',
          modelId: 'fake-model-1',
          price: { inputUsdPerMegaToken: '2', outputUsdPerMegaToken: '12' },
          maxThinkingTokens: 0,
          port: {
            requestTeamReport: (): Promise<ModelCallResult> =>
              Promise.resolve({ status: MODEL_CALL_STATUS.TIMEOUT }),
          },
        },
      ],
      cadenceMinutes: 60,
      candles: { findLatestOpenTime: () => Promise.resolve(params.candleTime) },
      reports: {
        enqueueTeamReports: (request) => {
          enqueued.push(request);
          return Promise.resolve(1);
        },
      },
      now: () => params.now,
    });
    return { enqueued, run: enqueuer.enqueueLatest };
  }

  test('enfileira a última vela gravada com o id e o ritmo, sem chave nem usuário', async () => {
    const harness = build({ candleTime: CANDLE_TIME, now: NOW });
    expect(await harness.run()).toBe(1);
    expect(harness.enqueued[0]).toStrictEqual({
      teams: [{ teamKey: 'nina', provider: 'google', modelId: 'fake-model-1' }],
      symbol: 'LINKUSDT',
      candleTime: CANDLE_TIME,
      cadenceMinutes: 60,
    });
  });

  test('par sem vela gravada ou com vela velha não enfileira nada', async () => {
    expect(await build({ candleTime: undefined, now: NOW }).run()).toBe(0);
    const stale = build({ candleTime: CANDLE_TIME, now: NOW + 3 * CANDLE_MILLISECONDS });
    expect(await stale.run()).toBe(0);
    expect(stale.enqueued).toHaveLength(0);
  });
});

describe('estado do provedor no batimento', () => {
  test('só booleanos, estado e instante: nunca chave, id do modelo nem URL', () => {
    const circuits = createTeamCircuits();
    const runtime: TeamRuntime = {
      teamKey: 'nina',
      provider: 'google',
      modelId: 'fake-model-1',
      price: { inputUsdPerMegaToken: '2', outputUsdPerMegaToken: '12' },
      maxThinkingTokens: 0,
      port: { requestTeamReport: () => Promise.resolve({ status: MODEL_CALL_STATUS.TIMEOUT }) },
    };
    circuits.record('nina', { status: MODEL_CALL_STATUS.KEY_REJECTED }, NOW);
    const status = buildProviderStatus({ runtimes: [runtime], circuits, now: () => NOW + 1 });
    const text = JSON.stringify(status);
    expect(text).not.toContain('fake-model-1');
    expect(text).not.toContain(SENTINEL);
    expect(status).toStrictEqual({
      nina: {
        keyConfigured: true,
        modelConfigured: true,
        providerState: 'key_rejected',
        circuitUntil: new Date(NOW + 3_600_000).toISOString(),
      },
      lucas: {
        keyConfigured: false,
        modelConfigured: false,
        providerState: 'no_key',
        circuitUntil: null,
      },
      olivia: {
        keyConfigured: false,
        modelConfigured: false,
        providerState: 'no_key',
        circuitUntil: null,
      },
    });
  });
});
