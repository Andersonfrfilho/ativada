// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { advanceCandle } from '../packages/run-recording/src/index.js';
import {
  createEngine,
  createInitialWalletState,
  ENGINE_INPUT_ERROR_CODE,
  ENGINE_VERSION,
  walletStep,
  type EntryRiskScale,
  type StepInput,
  type WalletStepInput,
} from '../packages/strategy-engine/src/index.js';
import { runSteps } from './fixtures/strategy-engine/engine-contract-runs.fixture.js';
import {
  buildReferenceRun,
  buildReferenceStrategy,
  MARKET_ENTRY,
} from './fixtures/strategy-engine/engine-scenarios.fixture.js';
import {
  buildClassicScenario,
  GOLDEN_DATASETS,
  runClassicEngine,
  summarizeEngineRun,
} from './fixtures/strategy-engine/production/engine-golden.fixture.js';
import {
  buildEntryScaleGolden,
  ENTRY_SCALE_GOLDEN_PATH,
  runScaledClassicEngine,
  type EntryScaleGolden,
} from './fixtures/strategy-engine/production/engine-scale-golden.fixture.js';
import { buildProductionScenarios } from './fixtures/strategy-engine/production/production-scenarios.fixture.js';
import {
  guardCandle,
  guardSignal,
  INVALID_ENTRY_RISK_SCALES,
} from './fixtures/strategy-engine/production/wallet-guard-cases.fixture.js';
import { REFERENCE_WALLET } from './fixtures/strategy-engine/wallet/wallet-differential.fixture.js';
import {
  compareScaledWallets,
  findScaleViolation,
  SCALE_FLOW_COUNT,
} from './fixtures/strategy-engine/wallet/wallet-scale-flow.fixture.js';

const TIMEOUT_MILLISECONDS = 600_000;
// Saldo e fração escolhidos para o valor em risco ter mais de 8 casas antes do arredondamento.
const HAND_STRATEGY = buildReferenceStrategy(MARKET_ENTRY, { riskPerTrade: '0.013' });
const HAND_RUN = buildReferenceRun({ initialBalance: '1234.56789012' });

function handInput(entryRiskScale?: EntryRiskScale): WalletStepInput {
  const candle = guardCandle(1);
  return {
    strategy: HAND_STRATEGY,
    run: HAND_RUN,
    state: {
      ...createInitialWalletState({ strategy: HAND_STRATEGY, run: HAND_RUN }),
      lastCandleOpenTime: guardCandle(0).openTime,
    },
    candle,
    signal: guardSignal({ candle, action: 'BUY', configHash: HAND_STRATEGY.configHash }),
    ...(entryRiskScale === undefined ? {} : { entryRiskScale }),
  };
}

function codeOf(run: () => unknown): string {
  try {
    run();
    return 'aceito';
  } catch (error) {
    const code: unknown =
      typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : undefined;
    return typeof code === 'string' ? code : String(error);
  }
}

describe('teto de entrada por passo (ADR 0002 A21): contas à mão', () => {
  // 1234,56789012 × 0,013 = 16,04938257156 → ×1 16,04938257; ×½ 8,02469128578 → 8,02469128; ×¼ 4,01234564289 → 4,01234564.
  test.each([
    ['sem escala', undefined, '16.04938257'],
    ["'1'", '1', '16.04938257'],
    ["'0.5'", '0.5', '8.02469128'],
    ["'0.25'", '0.25', '4.01234564'],
  ] as const)(
    '%s guarda o valor em risco com um arredondamento para baixo',
    (_label, scale, risk) => {
      const { orders } = walletStep(handInput(scale)).decisions;
      expect(orders.map((order) => [order.purpose, order.status, order.riskAmount])).toStrictEqual([
        ['entry', 'created', risk],
      ]);
    },
  );

  test("'0' não coloca a entrada e não deixa ordem recusada nem estado diferente do HOLD", () => {
    const zero = walletStep(handInput('0'));
    expect(zero.decisions.orders).toStrictEqual([]);
    expect(zero.state.pendingOrder).toBeNull();
    expect(zero.state.sequence).toBe(handInput().state.sequence);
  });

  test('a escala não entra no estado: o estado depois de ¼ só difere pela ordem pendente', () => {
    const full = walletStep(handInput()).state;
    const quarter = walletStep(handInput('0.25')).state;
    expect({ ...quarter, pendingOrder: null }).toStrictEqual({ ...full, pendingOrder: null });
    expect(Object.keys(quarter).sort()).toStrictEqual(Object.keys(full).sort());
  });

  test.each(INVALID_ENTRY_RISK_SCALES.map((scale) => [JSON.stringify(scale), scale] as const))(
    'a escala %s fora do conjunto é recusada pela carteira e pelo passo',
    (_label, scale) => {
      const code = ENGINE_INPUT_ERROR_CODE.ENTRY_RISK_SCALE_INVALID;
      expect(codeOf(() => walletStep(Object.assign(handInput(), { entryRiskScale: scale })))).toBe(
        code,
      );
      const scenario = requireScenario(0);
      const engine = createEngine();
      const state = engine.createInitialState({ strategy: scenario.strategy, run: scenario.run });
      const candle = scenario.candles[0];
      if (candle === undefined) throw new Error('Candle ausente.');
      const input: StepInput = { strategy: scenario.strategy, run: scenario.run, state, candle };
      expect(codeOf(() => engine.step(Object.assign(input, { entryRiskScale: scale })))).toBe(code);
    },
  );
});

function requireScenario(index: number): ReturnType<typeof buildProductionScenarios>[number] {
  const scenario = buildProductionScenarios()[index];
  if (scenario === undefined) throw new Error('Cenário ausente.');
  return scenario;
}

describe('teto de entrada por passo: o caminho até o motor', () => {
  test('advanceCandle repassa a escala ao passo, e sem ela o passo vai sem escala', () => {
    const scenario = requireScenario(0);
    const real = createEngine();
    const seen: (EntryRiskScale | undefined)[] = [];
    const engine = {
      ...real,
      step: (input: StepInput): ReturnType<typeof real.step> => {
        seen.push(input.entryRiskScale);
        return real.step(input);
      },
    };
    const [candle] = scenario.candles;
    if (candle === undefined) throw new Error('Candle ausente.');
    const base = {
      engine,
      strategy: scenario.strategy,
      setup: scenario.run,
      state: real.createInitialState({ strategy: scenario.strategy, run: scenario.run }),
      candle,
      previousOpenTime: null,
      durationMilliseconds: 3_600_000,
      pickSentiment: (): undefined => undefined,
    };
    advanceCandle({ ...base, entryRiskScale: '0.25' });
    advanceCandle(base);
    expect(seen).toStrictEqual(['0.25', undefined]);
  });

  test('a escala não muda configHash, runHash nem a versão do motor', () => {
    const scenario = requireScenario(6);
    const [first] = runSteps({ engine: createEngine(), scenario });
    expect(first?.result.state.configHash).toBe(scenario.strategy.configHash);
    expect(first?.result.state.runHash).toBe(scenario.run.runHash);
    expect(first?.result.state.engineVersion).toBe(ENGINE_VERSION);
  });
});

describe('teto de entrada por passo: produção contra a referência independente', () => {
  test(
    'estado e decisões iguais byte a byte em fluxos com escala (gerador separado)',
    () => {
      const report = compareScaledWallets({ production: walletStep, reference: REFERENCE_WALLET });
      expect(report.steps).toBeGreaterThan(SCALE_FLOW_COUNT * 30);
      expect(report.divergences).toStrictEqual([]);
    },
    TIMEOUT_MILLISECONDS,
  );

  test(
    "propriedades: risco ≤ escala × riskPerTrade × caixa, '0' sem entrada, saída nunca muda",
    () => {
      expect(findScaleViolation(walletStep)).toBeUndefined();
      expect(findScaleViolation(REFERENCE_WALLET)).toBeUndefined();
    },
    TIMEOUT_MILLISECONDS,
  );
});

async function readGolden(): Promise<EntryScaleGolden> {
  const file = Bun.file(ENTRY_SCALE_GOLDEN_PATH);
  if (!(await file.exists())) {
    throw new Error(`Grave o dourado com bun run scripts/record-engine-entry-scale-golden.ts.`);
  }
  return (await file.json()) as EntryScaleGolden;
}

describe.each(GOLDEN_DATASETS.map((dataset) => [dataset.name, dataset] as const))(
  'teto de entrada por passo sobre velas reais: %s',
  (name, dataset) => {
    const { initialBalance } = buildClassicScenario(dataset).run.parameters;

    test(
      "escala '1' em todo candle dá exatamente a execução sem escala (o dourado engine-2)",
      () => {
        const unscaled = summarizeEngineRun(runClassicEngine(dataset), initialBalance);
        const allFull = summarizeEngineRun(runScaledClassicEngine(dataset, ['1']), initialBalance);
        expect(allFull).toStrictEqual(unscaled);
      },
      TIMEOUT_MILLISECONDS,
    );

    test(
      'o ciclo de escalas confere com o dourado de escala desta versão do motor',
      async () => {
        const golden = await readGolden();
        expect(golden.engineVersion).toBe(ENGINE_VERSION);
        expect(buildEntryScaleGolden().datasets[name]).toStrictEqual(golden.datasets[name]);
      },
      TIMEOUT_MILLISECONDS,
    );
  },
);
