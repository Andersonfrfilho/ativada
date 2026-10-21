// Copyright (c) 2026 Ada Technology. All rights reserved.
// Estimativa da spec 013 (lucro mínimo por operação), SÓ em memória: o Placar clássico sobre os conjuntos reais de
// `test/fixtures/`, sem filtro e com o filtro simulado pelo `entryRiskScale: '0'` (A21) na vela em que a compra pedida
// não paga o mínimo. Não grava nada, não abre banco. Uso: `bun run scripts/minimum-edge-estimate.ts`.
import {
  createEngine,
  EngineDecimal,
  RISK_ATR_INDICATOR_ID,
  SIGNAL_ACTION,
  type EngineCandle,
  type EngineState,
  type EntryRiskScale,
} from '../packages/strategy-engine/src/index.js';
import { buildStepInput } from '../test/fixtures/strategy-engine/engine-contract-runs.fixture.js';
import type {
  EngineScenario,
  RecordedStep,
} from '../test/fixtures/strategy-engine/engine-contract-types.fixture.js';
import { buildReferenceRun } from '../test/fixtures/strategy-engine/engine-scenarios.fixture.js';
import {
  buildClassicScenario,
  summarizeEngineRun,
} from '../test/fixtures/strategy-engine/production/engine-golden.fixture.js';
import {
  CLASSIC_STRATEGY,
  REAL_DATASETS,
} from '../test/fixtures/strategy-engine/signal/classic-signals.fixture.js';
import btc15mRows from '../test/fixtures/risk-analyst/market/btcusdt-15m-3300.json' with { type: 'json' };

const MINIMUMS: readonly (string | null)[] = [null, '0.003', '0.006', '0.01'];
const NO_ENTRY: EntryRiskScale = '0';

function btc15mScenario(): EngineScenario {
  const candles: EngineCandle[] = btc15mRows.map((row) => ({
    symbol: 'BTCUSDT',
    timeframe: '15m',
    openTime: Number(row[0]),
    closeTime: Number(row[6]),
    open: String(row[1]),
    high: String(row[2]),
    low: String(row[3]),
    close: String(row[4]),
    volume: String(row[5]),
  }));
  return {
    name: 'BTCUSDT 15m × 3300',
    strategy: CLASSIC_STRATEGY,
    run: buildReferenceRun({ symbol: 'BTCUSDT', timeframe: '15m' }),
    candles,
    sentiment: [],
    commands: {},
    requiredEvents: [],
  };
}

type EdgeReading = { readonly atrRate: string; readonly netEdge: string } | null;

// Ganho possível líquido = alvo (m × ATR de `t`) ÷ fechamento de `t` − 2 × (taxa + slippage).
function readEdge(scenario: EngineScenario, state: EngineState, candle: EngineCandle): EdgeReading {
  const engine = createEngine();
  const input = buildStepInput({ scenario, state, candle, sentiment: scenario.sentiment });
  const { signal } = engine.signalStep({
    strategy: scenario.strategy,
    market: scenario.run.parameters,
    state: state.signal,
    candle,
    sentiment: input.sentiment,
    confirmedGapCandles: input.confirmedGapCandles,
  });
  // Toda vela de compra conta: a posição pode sair na própria vela `t` e a entrada nascer no fechamento dela.
  if (signal === null || signal.action !== SIGNAL_ACTION.BUY) return null;
  const atr = signal.indicators[RISK_ATR_INDICATOR_ID];
  if (atr === undefined || atr === null || atr <= 0) return null;
  const { feeRate, slippageRate } = scenario.run.parameters;
  const atrRate = new EngineDecimal(atr).dividedBy(candle.close);
  const target = atrRate.times(scenario.strategy.config.risk.targetAtrMultiple);
  const cost = new EngineDecimal(feeRate).plus(slippageRate).times(2);
  return { atrRate: atrRate.toFixed(6), netEdge: target.minus(cost).toFixed(6) };
}

type Measured = {
  readonly steps: RecordedStep[];
  readonly asked: string[];
  readonly blocked: number;
};

function measure(scenario: EngineScenario, minimum: string | null): Measured {
  const engine = createEngine();
  let state = engine.createInitialState({ strategy: scenario.strategy, run: scenario.run });
  const steps: RecordedStep[] = [];
  const asked: string[] = [];
  let blocked = 0;
  for (const candle of scenario.candles) {
    const edge = readEdge(scenario, state, candle);
    if (edge !== null) asked.push(edge.atrRate);
    const isBlocked =
      minimum !== null && edge !== null && new EngineDecimal(edge.netEdge).lt(minimum);
    if (isBlocked) blocked += 1;
    const base = buildStepInput({ scenario, state, candle, sentiment: scenario.sentiment });
    const input = isBlocked ? { ...base, entryRiskScale: NO_ENTRY } : base;
    const result = engine.step(input);
    steps.push({
      candle,
      sentiment: input.sentiment,
      commands: input.commands ?? [],
      entryRiskScale: input.entryRiskScale,
      confirmedGapCandles: input.confirmedGapCandles ?? 0,
      result,
    });
    state = result.state;
  }
  return { steps, asked, blocked };
}

function quantile(sorted: readonly string[], fraction: number): string {
  if (sorted.length === 0) return '-';
  const value = sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
  return value === undefined ? '-' : (Number(value) * 100).toFixed(3);
}

const scenarios = [...REAL_DATASETS.map(buildClassicScenario), btc15mScenario()];
console.log(
  '| Conjunto | Mínimo | Velas de compra | Barradas | Operações | Taxas pagas | Patrimônio final | ATR% p10/p50/p90 nas compras |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const scenario of scenarios) {
  for (const minimum of MINIMUMS) {
    const { steps, asked, blocked } = measure(scenario, minimum);
    const summary = summarizeEngineRun(steps, scenario.run.parameters.initialBalance);
    const sorted = [...asked].sort((left, right) => Number(left) - Number(right));
    const spread = `${quantile(sorted, 0.1)}/${quantile(sorted, 0.5)}/${quantile(sorted, 0.9)}`;
    const label = minimum === null ? 'sem filtro' : `${(Number(minimum) * 100).toFixed(1)}%`;
    console.log(
      `| ${scenario.name} | ${label} | ${asked.length} | ${blocked} | ${summary.operations} | ${summary.feesPaid} | ${summary.finalEquity} | ${spread} |`,
    );
  }
}
