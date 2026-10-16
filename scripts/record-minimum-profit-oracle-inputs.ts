// Copyright (c) 2026 Ada Technology. All rights reserved.
// Grava as entradas do oráculo `bigint` da spec 013 (T0.1): para cada vela em que o Placar clássico pediu compra nos
// conjuntos reais de `scripts/minimum-edge-estimate.ts`, o fechamento de `t` (texto exato) e o ATR de risco de `t` (o
// número do indicador, como o sinal o carrega). Só em memória; o oráculo NÃO importa `src`, então quem lê o motor é este
// script. Uso: `bun run scripts/record-minimum-profit-oracle-inputs.ts`.
import { writeFileSync } from 'node:fs';

import {
  createEngine,
  RISK_ATR_INDICATOR_ID,
  SIGNAL_ACTION,
  type EngineCandle,
} from '../packages/strategy-engine/src/index.js';
import { buildStepInput } from '../test/fixtures/strategy-engine/engine-contract-runs.fixture.js';
import type { EngineScenario } from '../test/fixtures/strategy-engine/engine-contract-types.fixture.js';
import { buildReferenceRun } from '../test/fixtures/strategy-engine/engine-scenarios.fixture.js';
import { buildClassicScenario } from '../test/fixtures/strategy-engine/production/engine-golden.fixture.js';
import {
  CLASSIC_STRATEGY,
  REAL_DATASETS,
} from '../test/fixtures/strategy-engine/signal/classic-signals.fixture.js';
import btc15mRows from '../test/fixtures/risk-analyst/market/btcusdt-15m-3300.json' with { type: 'json' };

const OUTPUT = new URL('../test/fixtures/minimum-profit/real-buy-candles.json', import.meta.url);

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

type BuyCandle = readonly [openTime: number, close: string, atr: number | null];

// O sinal só depende do próprio estado, nunca da carteira: as velas de compra são as mesmas com qualquer mínimo.
function collectBuyCandles(scenario: EngineScenario): BuyCandle[] {
  const engine = createEngine();
  let state = engine.createInitialState({ strategy: scenario.strategy, run: scenario.run });
  const buys: BuyCandle[] = [];
  for (const candle of scenario.candles) {
    const input = buildStepInput({ scenario, state, candle, sentiment: scenario.sentiment });
    const result = engine.step(input);
    const { signal } = result.decisions;
    if (signal !== null && signal.action === SIGNAL_ACTION.BUY) {
      buys.push([candle.openTime, candle.close, signal.indicators[RISK_ATR_INDICATOR_ID] ?? null]);
    }
    state = result.state;
  }
  return buys;
}

const scenarios = [...REAL_DATASETS.map(buildClassicScenario), btc15mScenario()];
const datasets = scenarios.map((scenario) => ({
  name: scenario.name,
  targetAtrMultiple: scenario.strategy.config.risk.targetAtrMultiple,
  feeRate: scenario.run.parameters.feeRate,
  slippageRate: scenario.run.parameters.slippageRate,
  buyCandles: collectBuyCandles(scenario),
}));
writeFileSync(OUTPUT, `${JSON.stringify({ datasets }, null, 2)}\n`);
console.log(datasets.map((dataset) => `${dataset.name}: ${dataset.buyCandles.length}`).join('\n'));
