// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  ENGINE_INPUT_ERROR_CODE,
  type EngineInputErrorCode,
} from '../../../../packages/strategy-engine/src/index.js';
import { runEngineContract } from '../engine-contract.fixture.js';
import { runSteps, buildStepInput } from '../engine-contract-runs.fixture.js';
import {
  compareWalletImplementations,
  REFERENCE_WALLET,
} from '../wallet/wallet-differential.fixture.js';
import { findFirstViolation } from '../wallet/wallet-properties.fixture.js';
import type { EngineApi } from './engine-api.fixture.js';
import { buildProductionScenarios } from './production-scenarios.fixture.js';
import { buildEchoedGapInput, buildWalletGuardCases } from './wallet-guard-cases.fixture.js';

// Quem reprova primeiro, na ordem em que o juiz pergunta. O diferencial e as propriedades usam uma
// fração dos fluxos (o suficiente para reprovar qualquer mutante); o motor real passa por todos.
export const JUDGE_STAGE = {
  GUARDS: 'guards',
  ENGINE_API: 'engine-api',
  DIFFERENTIAL: 'differential',
  PROPERTIES: 'properties',
  HARNESS: 'harness',
} as const;

export type JudgeStage = (typeof JUDGE_STAGE)[keyof typeof JUDGE_STAGE];

export type JudgeVerdict = { readonly stage: JudgeStage; readonly detail: string } | undefined;

export type JudgeParams = {
  readonly api: EngineApi;
  readonly flowCount?: number;
};

// Pelo campo `code`, não por `instanceof`: a cópia mutada de `src` é outro módulo, com outras classes.
function codeOf(run: () => unknown): string {
  try {
    run();
    return 'aceito';
  } catch (error) {
    if (typeof error !== 'object' || error === null) return String(error);
    const code: unknown = Object.getOwnPropertyDescriptor(error, 'code')?.value;
    return typeof code === 'string' ? code : 'erro sem código';
  }
}

function judgeGuards(api: EngineApi): JudgeVerdict {
  for (const guard of buildWalletGuardCases()) {
    const received = codeOf(() => api.walletStep(guard.input));
    if (received !== guard.code) {
      return {
        stage: JUDGE_STAGE.GUARDS,
        detail: `${guard.label}: esperado ${guard.code}, veio ${received}`,
      };
    }
  }
  const echoed = codeOf(() => api.walletStep(buildEchoedGapInput()));
  if (echoed !== 'aceito') {
    return { stage: JUDGE_STAGE.GUARDS, detail: `lacuna ecoada recusada com ${echoed}` };
  }
  return undefined;
}

const GAP_PROBE_CANDLES = 40;
const GAP_PROBE_SKIPPED = 1;

// O sinal ecoa a lacuna confirmada e a carteira avulsa a exige; o passo recusa relatórios da corretora.
function judgeEngineApi(api: EngineApi): JudgeVerdict {
  const scenario = buildProductionScenarios()[0];
  if (scenario === undefined) throw new Error('Cenário ausente.');
  const engine = api.createEngine();
  const steps = runSteps({
    engine,
    scenario,
    candles: scenario.candles.slice(0, GAP_PROBE_CANDLES),
  });
  const last = steps.at(-1);
  const afterGap = scenario.candles[GAP_PROBE_CANDLES + GAP_PROBE_SKIPPED];
  if (last === undefined || afterGap === undefined) throw new Error('Passo ausente.');
  const input = {
    ...buildStepInput({ scenario, state: last.result.state, candle: afterGap, sentiment: [] }),
    confirmedGapCandles: GAP_PROBE_SKIPPED,
  };
  const echoed = engine.step(input).decisions.signal?.confirmedGapCandles;
  if (echoed !== GAP_PROBE_SKIPPED) {
    return { stage: JUDGE_STAGE.ENGINE_API, detail: `o sinal ecoou a lacuna ${String(echoed)}` };
  }
  const report = {
    kind: 'order_rejected',
    reportId: 'report-1',
    reportedAt: afterGap.openTime,
    orderKey: 'order-0',
  } as const;
  const refused: EngineInputErrorCode = ENGINE_INPUT_ERROR_CODE.EXECUTION_REPORTS_UNSUPPORTED;
  if (codeOf(() => engine.step({ ...input, executionReports: [report] })) !== refused) {
    return { stage: JUDGE_STAGE.ENGINE_API, detail: 'o passo aceitou relatório da corretora' };
  }
  return undefined;
}

// Dois cenários baratos: o de mercado com gaps (0) e o de comandos e sentimento (5).
const HARNESS_SCENARIO_INDEXES: readonly number[] = [0, 5];

function judgeHarness(api: EngineApi): JudgeVerdict {
  const all = buildProductionScenarios();
  try {
    runEngineContract({
      createEngine: api.createEngine,
      scenarios: HARNESS_SCENARIO_INDEXES.flatMap((index) => all[index] ?? []),
    });
    return undefined;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { stage: JUDGE_STAGE.HARNESS, detail };
  }
}

export function judgeEngineApiAgainstReference(params: JudgeParams): JudgeVerdict {
  const { api } = params;
  const guards = judgeGuards(api) ?? judgeEngineApi(api);
  if (guards !== undefined) return guards;
  const report = compareWalletImplementations({
    production: api.walletStep,
    reference: REFERENCE_WALLET,
    shouldStopAtFirst: true,
    ...(params.flowCount === undefined ? {} : { count: params.flowCount }),
  });
  const divergence = report.divergences[0];
  if (divergence !== undefined) {
    const where = `fluxo ${divergence.flowIndex}, passo ${divergence.stepIndex}`;
    return { stage: JUDGE_STAGE.DIFFERENTIAL, detail: where };
  }
  const violation = findFirstViolation(api.walletStep, params.flowCount);
  if (violation !== undefined) return { stage: JUDGE_STAGE.PROPERTIES, detail: violation };
  return judgeHarness(api);
}
