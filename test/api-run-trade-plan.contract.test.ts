// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { JsonContainer, TeamReportRow } from '../packages/database/src/index.js';
import {
  createInitialWalletState,
  simulatedFillModel,
  type FillModelResult,
  type PendingOrderState,
  type RunSetup,
  type WalletState,
} from '../packages/strategy-engine/src/index.js';
import { EMPTY_OVERVIEW } from './fixtures/api-routes/in-memory-model-teams.fixture.js';
import { expectIndistinguishableNotFound } from './fixtures/not-found-response.fixture.js';
import {
  buildHourlyCandles,
  createRunsHarness,
  HOUR,
  MISSING_ID,
  NOW,
  readJson,
  SUBJECT_A,
  SUBJECT_B,
  type RunsHarness,
} from './fixtures/api-routes/runs-harness.fixture.js';
import {
  at,
  CLASSIC_CANDLES,
  createLiveRun,
  decisionRow,
  equityRow,
  PERIOD_START,
  positionRow,
  seedDecisions,
  type ClassicVotes,
} from './fixtures/live-status/live-status-scenario.fixture.js';
import {
  buildCandles,
  buildReferenceRun,
  buildReferenceStrategy,
  MARKET_ENTRY,
  type CandleSpec,
} from './fixtures/strategy-engine/engine-scenarios.fixture.js';
import {
  oracleBuyCost,
  oracleMinus,
  oracleMoveRate,
  oracleResult,
  oracleTimes,
} from './fixtures/trade-plan/trade-plan-oracle.fixture.js';

const RUNS = '/v1/runs';
const TRADE_PLAN = '/trade-plan';
const FEE = '0.001';
const WAITING_VOTES: ClassicVotes = [1, -1, 0, 1];
const DECISIONS = 30;
const PEPE = 'PEPEUSDT';
const PEPE_TICK = '0.00000001';
const DECIMAL = /^-?\d+(\.\d+)?$/;
const NOTICE =
  'Estimativa da simulação, com taxa e deslizamento já descontados. Não é recomendação de compra ou venda: o preço pode nunca chegar lá.';

type Result = { net: string; rate: string };
type Protective = {
  price: string;
  exitPrice: string;
  fromEntryRate: string;
  distance: { value: string; rate: string };
  result: Result | null;
};
type Sizing = {
  riskAmount: string;
  quantity: string;
  notional: string;
  entryCost: string;
  constraint: string;
};
type Plan = {
  status: string;
  reason?: string;
  message: string;
  currentPrice?: string;
  nextOpenEstimate?: string | null;
  orderType?: string;
  entry?: { price: string; distance: { value: string; rate: string } };
  entryPrice?: string;
  quantity?: string;
  entryCost?: string;
  exit?: { price: string; distance: { value: string; rate: string }; result: Result };
  target?: Protective;
  stop?: Protective;
  sizing?: Sizing;
};
type Team = Record<string, unknown> & {
  status: string;
  teamKey: string;
  target?: Protective;
  stop?: Protective;
  sizing?: Sizing;
  entry?: { price: string; suggestedPrice: string };
};
type TradePlan = {
  version: string;
  runId: string;
  symbol: string;
  timeframe: string;
  notice: string;
  plan: Plan;
  teams: Team[];
};

// A vela da PEPE (tick 0,00000001, passo 1): o fechamento e o volume que o dimensionamento usa.
const PEPE_CANDLES = buildHourlyCandles({ symbol: PEPE, count: 60, firstOpenTime: at(0) }).map(
  (candle) => ({ ...candle, close: '0.00001234', volume: '100000000000' }),
);

let harness: RunsHarness;

beforeAll(async () => {
  harness = await createRunsHarness({ candles: [...CLASSIC_CANDLES, ...PEPE_CANDLES] });
});

afterAll(async () => {
  await harness.stop();
});

afterEach(async () => {
  harness.modelTeams.state.overview = EMPTY_OVERVIEW;
  const scope = harness.scopeOf(SUBJECT_A);
  for (const teamKey of ['nina', 'lucas', 'olivia']) {
    await harness.modelTeams.teams.setEnabled(scope, { teamKey, isEnabled: false });
  }
});

function withAtr(index: number, atr: number | null): ReturnType<typeof decisionRow> {
  const row = decisionRow(index, WAITING_VOTES);
  return { ...row, indicators: { ...(row.indicators as object), 'risk:atr': atr } };
}

function seedFlat(runId: string, atr: number | null, equity = '1000'): void {
  seedDecisions(
    harness,
    runId,
    Array.from({ length: DECISIONS }, (_unused, index) => ({
      signal: withAtr(index, atr),
      equity: equityRow(index, equity, '1000'),
    })),
  );
}

async function tradePlanOf(runId: string, subject = SUBJECT_A): Promise<TradePlan> {
  const { status, body } = await readJson(
    await harness.call({ subject, path: `${RUNS}/${runId}${TRADE_PLAN}` }),
  );
  expect(status).toBe(200);
  return (body as { data: TradePlan }).data;
}

function toJsonContainer(value: unknown): JsonContainer {
  return JSON.parse(JSON.stringify(value)) as JsonContainer;
}

async function createCustomRun(params: {
  readonly symbol: string;
  readonly parameters: Record<string, unknown>;
  readonly request?: Record<string, unknown>;
}): Promise<string> {
  const { versionId } = await harness.seedStrategy(SUBJECT_A, `plan-${crypto.randomUUID()}`);
  const created = await harness.runs.repository.createRun(harness.scopeOf(SUBJECT_A), {
    strategyVersionId: versionId,
    kind: 'live_paper',
    symbol: params.symbol,
    timeframe: '1h',
    runParameters: toJsonContainer(params.parameters),
    runHash: 'h'.repeat(64),
    engineVersion: 'engine-2',
    signalEngineVersion: 'signal-2',
    metricsVersion: 'metrics-1',
    periodStart: PERIOD_START,
    periodEnd: undefined,
    migratedFromRunId: undefined,
    ...(params.request === undefined ? {} : { request: toJsonContainer(params.request) }),
  });
  if (created === undefined) throw new Error('execução semente não criada');
  harness.runs.updateRun(created.id, { status: 'running' });
  return created.id;
}

const BTC_PARAMETERS = {
  ...buildReferenceRun({ symbol: 'BTCUSDT', timeframe: '1h' }).parameters,
  initialBalance: '1000',
};

function teamReport(overrides: Partial<TeamReportRow>): TeamReportRow {
  return {
    id: crypto.randomUUID(),
    teamKey: 'olivia',
    kind: 'scheduled',
    candleTime: at(DECISIONS - 1),
    status: 'decided',
    failureCode: null,
    action: 'buy',
    entryPrice: '30060',
    targetPrice: '30900.004',
    stopPrice: '29500.006',
    confidence: 72,
    roles: null,
    isReasonHidden: false,
    latencyMilliseconds: 900,
    costUsd: '0.001',
    requestedAt: new Date(NOW),
    decidedAt: new Date(NOW),
    ...overrides,
  };
}

function expectProtective(params: {
  readonly level: Protective | undefined;
  readonly price: string;
  readonly exitPrice: string;
  readonly entry: string;
  readonly current: string;
  readonly quantity: string;
  readonly direction: 'up' | 'down';
}): void {
  const { level, price, exitPrice, entry, current, quantity, direction } = params;
  expect(level).toStrictEqual({
    price,
    exitPrice,
    fromEntryRate: oracleMoveRate(entry, price, direction),
    distance: {
      value: oracleMinus(price, current),
      rate: oracleMoveRate(current, price, direction),
    },
    result: oracleResult({ quantity, entry, exit: exitPrice, feeRate: FEE }),
  });
}

describe('aguardando a compra: a compra simulada da próxima vela', () => {
  test('entrada, alvo e stop no tick, quantidade do motor e o líquido em cada saída', async () => {
    const runId = await createLiveRun(harness, { subject: SUBJECT_A });
    seedFlat(runId, 300);
    const data = await tradePlanOf(runId);
    expect(data.version).toBe('trade-plan-1');
    expect(data.notice).toBe(NOTICE);
    expect(data.teams).toStrictEqual([]);
    const { plan } = data;
    const quantity = plan.sizing?.quantity ?? '';
    // 30.050,50 × 1,0005 = 30.065,52525 → 30.065,53; stop 30.065,53 − 2 × 300 e alvo + 3 × 300; saída do stop 29.465,53 × 0,9995.
    expect(plan).toMatchObject({
      status: 'awaiting_entry',
      candleTime: at(DECISIONS - 1),
      closedAt: at(DECISIONS - 1) + HOUR,
      currentPrice: '30050.5',
      orderType: 'market',
      nextOpenEstimate: '30050.5',
      entry: {
        price: '30065.53',
        distance: { value: '15.03', rate: oracleMoveRate('30050.5', '30065.53', 'up') },
      },
    });
    expect(plan.sizing).toStrictEqual({
      riskAmount: '10',
      quantity,
      notional: oracleTimes(quantity, '30065.53'),
      entryCost: oracleBuyCost(quantity, '30065.53', FEE),
      constraint: 'none',
    });
    const common = { entry: '30065.53', current: '30050.5', quantity };
    expectProtective({
      ...common,
      level: plan.target,
      price: '30965.53',
      exitPrice: '30965.53',
      direction: 'up',
    });
    expectProtective({
      ...common,
      level: plan.stop,
      price: '29465.53',
      exitPrice: '29450.79',
      direction: 'down',
    });
    // A perda no stop nunca passa do valor em risco (1% do caixa).
    expect(Number(plan.stop?.result?.net)).toBeGreaterThanOrEqual(-10);
    expect(Number(plan.stop?.result?.net)).toBeLessThan(0);
  });

  test('as taxas arredondam contra o usuário: o alvo sobe, o stop e o líquido descem', async () => {
    const runId = await createLiveRun(harness, { subject: SUBJECT_A });
    seedFlat(runId, 300);
    const { plan } = await tradePlanOf(runId);
    const quantity = plan.sizing?.quantity ?? '';
    // Divisões que não terminam a 12 casas: a direção é visível.
    expect(plan.target?.fromEntryRate).not.toBe(oracleMoveRate('30065.53', '30965.53', 'down'));
    expect(plan.stop?.fromEntryRate).not.toBe(oracleMoveRate('30065.53', '29465.53', 'up'));
    const cost = oracleBuyCost(quantity, '30065.53', FEE);
    expect(plan.target?.result?.rate).toBe(
      oracleResult({ quantity, entry: '30065.53', exit: '30965.53', feeRate: FEE }).rate,
    );
    expect(cost).toBe(plan.sizing?.entryCost ?? '');
  });

  test('a frase do servidor traz os preços e o líquido, sem data nem hora', async () => {
    const runId = await createLiveRun(harness, { subject: SUBJECT_A });
    seedFlat(runId, 300);
    const { plan } = await tradePlanOf(runId);
    expect(plan.message).toStartWith(
      'Se a estratégia comprar na próxima vela, a compra simulada sai perto de 30.065,53 USDT. No alvo (30.965,53) o resultado seria +',
    );
    expect(plan.message).toContain('no stop (29.465,53), −');
    expect(plan.message).not.toMatch(/\d{1,2}:\d{2}|\d{2}\/\d{2}/);
  });
});

describe('comprada: vender agora, alvo e stop da posição gravada', () => {
  test('a venda simulada a mercado e o líquido de cada saída', async () => {
    const runId = await createLiveRun(harness, { subject: SUBJECT_A });
    seedFlat(runId, 300);
    harness.runs.seed(runId, 'positions', [
      positionRow({ key: 'p-open', openedIndex: 20, closedIndex: undefined }),
    ]);
    const { plan } = await tradePlanOf(runId);
    const position = { entry: '30000.5', current: '30050.5', quantity: '0.033' };
    // 30.050,50 × 0,9995 = 30.035,47475 → 30.035,47 (tick para baixo).
    expect(plan).toMatchObject({
      status: 'holding',
      currentPrice: '30050.5',
      entryPrice: '30000.5',
      quantity: '0.033',
      entryCost: oracleBuyCost('0.033', '30000.5', FEE),
      openedCandleTime: at(20),
      exit: {
        price: '30035.47',
        distance: { value: '-15.03', rate: oracleMoveRate('30050.5', '30035.47', 'down') },
        result: oracleResult({
          quantity: '0.033',
          entry: '30000.5',
          exit: '30035.47',
          feeRate: FEE,
        }),
      },
    });
    expectProtective({
      ...position,
      level: plan.target,
      price: '31500',
      exitPrice: '31500',
      direction: 'up',
    });
    expectProtective({
      ...position,
      level: plan.stop,
      price: '29000',
      exitPrice: '28985.5',
      direction: 'down',
    });
    expect(plan.message).toStartWith(
      'Comprada a 30.000,50 USDT. Vendendo agora, a simulação sairia a 30.035,47 USDT: ',
    );
  });
});

describe('sem números: o motivo tipado', () => {
  const cases: readonly [string, (runId: string) => void, string][] = [
    [
      'stalled',
      (runId): void => harness.runs.updateRun(runId, { stalledSince: NOW - HOUR }),
      'A simulação está parada esperando o sistema voltar: as estimativas voltam com a próxima vela decidida.',
    ],
    [
      'waiting_for_data',
      (runId): void => harness.runs.updateRun(runId, { waitingSince: NOW - HOUR }),
      'A simulação espera velas que faltam: as estimativas voltam quando elas chegarem.',
    ],
    [
      'no_candle',
      (): void => undefined,
      'Ainda sem vela decidida: as estimativas aparecem depois da primeira decisão.',
    ],
    [
      'no_atr',
      (runId): void => seedFlat(runId, null),
      'A estratégia ainda junta velas para medir a volatilidade (ATR): sem ela não há stop nem alvo.',
    ],
    [
      'invalid_stop',
      (runId): void => seedFlat(runId, 0.001),
      'A volatilidade está pequena demais para este par: o stop ficaria acima da venda possível e a simulação não compraria.',
    ],
  ];

  test.each(cases)('%s', async (reason, arrange, message) => {
    const runId = await createLiveRun(harness, { subject: SUBJECT_A });
    harness.modelTeams.enable(harness.scopeOf(SUBJECT_A), 'olivia');
    harness.modelTeams.state.overview = { ...EMPTY_OVERVIEW, latest: [teamReport({})] };
    arrange(runId);
    const data = await tradePlanOf(runId);
    expect(data.plan).toStrictEqual({ status: 'unavailable', reason, message });
    if (reason !== 'no_atr' && reason !== 'invalid_stop') expect(data.teams).toStrictEqual([]);
  });

  test('simulação que não roda: uma consulta só, nada além da execução', async () => {
    const runId = await createLiveRun(harness, { subject: SUBJECT_A, status: 'completed' });
    seedFlat(runId, 300);
    harness.queries.length = 0;
    const data = await tradePlanOf(runId);
    expect(data.plan).toStrictEqual({
      status: 'unavailable',
      reason: 'not_running',
      message: 'A simulação não está rodando: não há próxima compra nem venda a estimar.',
    });
    expect(harness.queries).toStrictEqual(['findRun']);
  });
});

describe('dono e tipo', () => {
  test('execução alheia, inexistente e id malformado são o mesmo 404', async () => {
    const runId = await createLiveRun(harness, { subject: SUBJECT_A });
    seedFlat(runId, 300);
    const missing = (): Promise<Response> =>
      harness.call({ subject: SUBJECT_A, path: `${RUNS}/${MISSING_ID}${TRADE_PLAN}` });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/${runId}${TRADE_PLAN}`,
      }),
      missingResourceResponse: await missing(),
    });
    await expectIndistinguishableNotFound({
      expectedCode: 'RUN_NOT_FOUND',
      foreignResourceResponse: await harness.call({
        subject: SUBJECT_B,
        path: `${RUNS}/xyz${TRADE_PLAN}`,
      }),
      missingResourceResponse: await missing(),
    });
  });

  test('backtest é 409 RUN_NOT_LIVE e parâmetro de consulta é 400', async () => {
    const runId = await createLiveRun(harness, { subject: SUBJECT_A, kind: 'backtest' });
    const conflict = await readJson(
      await harness.call({ subject: SUBJECT_A, path: `${RUNS}/${runId}${TRADE_PLAN}` }),
    );
    expect(conflict.status).toBe(409);
    expect((conflict.body as { error: { code: string } }).error.code).toBe('RUN_NOT_LIVE');
    const live = await createLiveRun(harness, { subject: SUBJECT_A });
    const invalid = await harness.call({
      subject: SUBJECT_A,
      path: `${RUNS}/${live}${TRADE_PLAN}?x=1`,
    });
    expect(invalid.status).toBe(400);
  });
});

describe('equipes de modelo ligadas', () => {
  test('Olívia: a última recomendação decidida com as mesmas contas; equipe desligada não aparece', async () => {
    const runId = await createLiveRun(harness, { subject: SUBJECT_A });
    seedFlat(runId, 300);
    harness.modelTeams.enable(harness.scopeOf(SUBJECT_A), 'olivia');
    const older = teamReport({
      candleTime: at(DECISIONS - 3),
      action: 'hold',
      entryPrice: null,
      targetPrice: null,
      stopPrice: null,
    });
    const report = teamReport({});
    const nina = teamReport({ teamKey: 'nina' });
    const onDemand = teamReport({ kind: 'on_demand', candleTime: at(DECISIONS), entryPrice: '1' });
    harness.modelTeams.state.overview = {
      ...EMPTY_OVERVIEW,
      latest: [older, onDemand, report, nina],
    };
    const { teams } = await tradePlanOf(runId);
    expect(teams.map((team) => team.teamKey)).toStrictEqual(['olivia']);
    const [olivia] = teams;
    const quantity = olivia?.sizing?.quantity ?? '';
    // Entrada 30.060 × 1,0005 = 30.075,03; alvo 30.900,004 → 30.900,01; proteção 29.500,006 → 29.500,00 (tick para baixo).
    expect(olivia).toMatchObject({
      status: 'available',
      displayName: 'Olívia',
      reportId: report.id,
      candleTime: report.candleTime,
      confidence: 72,
      wallet: null,
      entry: { suggestedPrice: '30060', price: '30075.03' },
    });
    const common = { entry: '30075.03', current: '30050.5', quantity };
    expectProtective({
      ...common,
      level: olivia?.target,
      price: '30900.01',
      exitPrice: '30900.01',
      direction: 'up',
    });
    expectProtective({
      ...common,
      level: olivia?.stop,
      price: '29500',
      exitPrice: '29485.25',
      direction: 'down',
    });
    expect(olivia?.['message']).toStartWith(
      'Olívia sugere comprar perto de 30.060,00 USDT, vender a 30.900,01 e proteger em 29.500,00 (confiança 72 de 100).',
    );
  });

  test('segurar, sem leitura e preços que não cabem: o motivo, sem números', async () => {
    const runId = await createLiveRun(harness, { subject: SUBJECT_A });
    seedFlat(runId, 300);
    harness.modelTeams.enable(harness.scopeOf(SUBJECT_A), 'olivia');
    harness.modelTeams.enable(harness.scopeOf(SUBJECT_A), 'lucas');
    harness.modelTeams.enable(harness.scopeOf(SUBJECT_A), 'nina');
    const hold = teamReport({
      action: 'hold',
      entryPrice: null,
      targetPrice: null,
      stopPrice: null,
      confidence: 40,
    });
    const invalid = teamReport({ teamKey: 'lucas', targetPrice: '30061' });
    harness.modelTeams.state.overview = { ...EMPTY_OVERVIEW, latest: [hold, invalid] };
    const { teams } = await tradePlanOf(runId);
    expect(teams).toStrictEqual([
      {
        status: 'unavailable',
        teamKey: 'nina',
        displayName: 'Nina',
        wallet: null,
        reason: 'no_report',
        reportId: null,
        candleTime: null,
        action: null,
        confidence: null,
        message: 'Nina ainda não tem leitura decidida deste par.',
      },
      {
        status: 'unavailable',
        teamKey: 'lucas',
        displayName: 'Lucas',
        wallet: null,
        reason: 'invalid_levels',
        reportId: invalid.id,
        candleTime: invalid.candleTime,
        action: 'buy',
        confidence: 72,
        message:
          'Lucas sugeriu preços que não cabem na simulação (proteção acima da venda possível ou alvo abaixo da compra).',
      },
      {
        status: 'unavailable',
        teamKey: 'olivia',
        displayName: 'Olívia',
        wallet: null,
        reason: 'no_entry',
        reportId: hold.id,
        candleTime: hold.candleTime,
        action: 'hold',
        confidence: 40,
        message: 'Olívia não sugere compra agora: não há entrada a medir.',
      },
    ]);
  });

  test('na execução da própria equipe, a carteira dela', async () => {
    const runId = await createCustomRun({
      symbol: 'BTCUSDT',
      parameters: BTC_PARAMETERS,
      request: { signalSource: { kind: 'model_team', team: 'olivia' } },
    });
    seedFlat(runId, 300, '1023.4');
    harness.modelTeams.enable(harness.scopeOf(SUBJECT_A), 'olivia');
    harness.modelTeams.state.overview = { ...EMPTY_OVERVIEW, latest: [teamReport({})] };
    const { teams } = await tradePlanOf(runId);
    expect(teams[0]?.['wallet']).toStrictEqual({
      current: '1023.4',
      result: '23.4',
      resultRate: '0.0234',
    });
  });
});

describe('PEPE: tick 0,00000001 e passo 1, sem perder precisão', () => {
  test('preços na grade, quantidade inteira e o líquido exato do oráculo', async () => {
    const runId = await createCustomRun({
      symbol: PEPE,
      parameters: {
        ...BTC_PARAMETERS,
        symbol: PEPE,
        tickSize: PEPE_TICK,
        quantityStep: '1',
        minNotional: '1',
      },
    });
    seedFlat(runId, 3e-7);
    const { plan } = await tradePlanOf(runId);
    const quantity = plan.sizing?.quantity ?? '';
    // 0,00001234 × 1,0005 = 0,0000123461700 → 0,00001235; stop − 6e-7, alvo + 9e-7; saída 0,00001175 × 0,9995 → 0,00001174.
    expect(plan).toMatchObject({
      status: 'awaiting_entry',
      currentPrice: '0.00001234',
      entry: { price: '0.00001235', distance: { value: '0.00000001' } },
      sizing: { riskAmount: '10', constraint: 'none' },
    });
    expect(quantity).toMatch(/^\d+$/);
    const common = { entry: '0.00001235', current: '0.00001234', quantity };
    expectProtective({
      ...common,
      level: plan.target,
      price: '0.00001325',
      exitPrice: '0.00001325',
      direction: 'up',
    });
    expectProtective({
      ...common,
      level: plan.stop,
      price: '0.00001175',
      exitPrice: '0.00001174',
      direction: 'down',
    });
    const texts = JSON.stringify(plan).match(/"-?[\d.e+-]+"/g) ?? [];
    for (const value of texts) expect(JSON.parse(value) as string).toMatch(DECIMAL);
    expect(Number(plan.stop?.result?.net)).toBeGreaterThanOrEqual(-10);
    expect(plan.message).toContain('perto de 0,00001235 USDT');
  });
});

// Paridade com o motor de verdade: a ordem que o motor guardaria na vela decidida (risco = 1% do caixa, distâncias pelo ATR,
// volume da vela) preenche na abertura estimada e sai no alvo ou no stop; o `net_profit` gravado é o líquido do plano.
const STRATEGY = buildReferenceStrategy(MARKET_ENTRY);

function replay(params: {
  readonly run: RunSetup;
  readonly state: Partial<WalletState>;
  readonly candle: CandleSpec;
}): FillModelResult {
  const candle = buildCandles([params.candle, params.candle])[1];
  if (candle === undefined) throw new Error('vela ausente');
  return simulatedFillModel({
    strategy: STRATEGY,
    run: params.run,
    state: {
      ...createInitialWalletState({ strategy: STRATEGY, run: params.run }),
      ...params.state,
    },
    candle,
    executionReports: [],
  });
}

function entryOrder(atr: { stop: string; target: string }, volume: string): PendingOrderState {
  return {
    orderKey: 'order-0',
    side: 'buy',
    type: 'market',
    purpose: 'entry',
    createdCandleOpenTime: 0,
    limitPrice: null,
    riskAmount: '10',
    stopDistance: atr.stop,
    targetDistance: atr.target,
    eligibleCandles: null,
    decisionVolume: volume,
    filledQuantity: '0',
    exitReason: null,
  };
}

describe('paridade com o preenchimento do motor', () => {
  const BTC_RUN = buildReferenceRun({ symbol: 'BTCUSDT', timeframe: '1h', initialBalance: '1000' });
  const BTC_ORDER = entryOrder({ stop: '600', target: '900' }, '12.5');

  test('BTC: a compra na abertura estimada sai no alvo e no stop com o líquido do plano', async () => {
    const runId = await createLiveRun(harness, { subject: SUBJECT_A });
    seedFlat(runId, 300);
    const { plan } = await tradePlanOf(runId);
    const atTarget = replay({
      run: BTC_RUN,
      state: { pendingOrder: BTC_ORDER },
      candle: ['30050.5', '31000', '30000', '30900'],
    });
    expect(atTarget.fills[0]).toMatchObject({
      price: plan.entry?.price,
      quantity: plan.sizing?.quantity,
    });
    expect(atTarget.openedPositions[0]).toMatchObject({
      stopPrice: plan.stop?.price,
      targetPrice: plan.target?.price,
    });
    expect(atTarget.closedPositions[0]).toMatchObject({
      exitReason: 'target',
      exitPrice: plan.target?.exitPrice,
      netProfit: plan.target?.result?.net,
    });
    const atStop = replay({
      run: BTC_RUN,
      state: { pendingOrder: BTC_ORDER },
      candle: ['30050.5', '30100', '29400', '29500'],
    });
    expect(atStop.closedPositions[0]).toMatchObject({
      exitReason: 'stop',
      exitPrice: plan.stop?.exitPrice,
      netProfit: plan.stop?.result?.net,
    });
  });

  test('comprada: vender na abertura seguinte dá o líquido de "vender agora"', async () => {
    const runId = await createLiveRun(harness, { subject: SUBJECT_A });
    seedFlat(runId, 300);
    const position = positionRow({ key: 'p-open', openedIndex: 20, closedIndex: undefined });
    harness.runs.seed(runId, 'positions', [position]);
    const { plan } = await tradePlanOf(runId);
    const sale: PendingOrderState = {
      ...BTC_ORDER,
      side: 'sell',
      purpose: 'exit',
      riskAmount: null,
      stopDistance: null,
      targetDistance: null,
      decisionVolume: null,
      exitReason: 'signal',
    };
    const held = {
      positionKey: 'position-0',
      openedCandleOpenTime: -1,
      entryPrice: position.entryPrice,
      quantity: position.quantity,
      stopPrice: position.stopPrice,
      targetPrice: position.targetPrice,
      entryFee: position.entryFee,
    };
    const result = replay({
      run: BTC_RUN,
      state: { position: held, pendingOrder: sale },
      candle: ['30050.5', '30060', '30040', '30050'],
    });
    expect(result.closedPositions[0]).toMatchObject({
      exitPrice: plan.exit?.price,
      netProfit: plan.exit?.result.net,
    });
  });

  test('PEPE: a mesma paridade com tick 0,00000001 e passo 1', async () => {
    const pepeParameters = {
      symbol: PEPE,
      tickSize: PEPE_TICK,
      quantityStep: '1',
      minNotional: '1',
    };
    const runId = await createCustomRun({
      symbol: PEPE,
      parameters: { ...BTC_PARAMETERS, ...pepeParameters },
    });
    seedFlat(runId, 3e-7);
    const { plan } = await tradePlanOf(runId);
    const run = buildReferenceRun({ timeframe: '1h', initialBalance: '1000', ...pepeParameters });
    const order = entryOrder({ stop: '0.0000006', target: '0.0000009' }, '100000000000');
    const atTarget = replay({
      run,
      state: { pendingOrder: order },
      candle: ['0.00001234', '0.0000134', '0.0000120', '0.0000133'],
    });
    expect(atTarget.closedPositions[0]).toMatchObject({
      quantity: plan.sizing?.quantity,
      netProfit: plan.target?.result?.net,
    });
    const atStop = replay({
      run,
      state: { pendingOrder: order },
      candle: ['0.00001234', '0.0000124', '0.0000110', '0.0000112'],
    });
    expect(atStop.closedPositions[0]).toMatchObject({
      exitPrice: plan.stop?.exitPrice,
      netProfit: plan.stop?.result?.net,
    });
  });
});
