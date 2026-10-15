// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  RUN_KIND,
  type DecisionMarket,
  type OwnerScope,
  type RunRecord,
  type RunRepository,
  type RunResultRepository,
  type StrategyRepository,
  type TimeRange,
  type WalkForwardWindowInput,
} from '@ativada/database';
import {
  ENGINE_TIMEFRAME,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  parseStrategyConfig,
  type StrategyConfig,
} from '@ativada/strategy-engine';

import { RunNotFoundError } from '../run.error.js';
import { CHART_WINDOW_READ_LIMIT } from '../runs.constant.js';
import { resolveRunRange } from '../chart/run-chart-range.js';
import {
  buildThresholdSegments,
  deriveWindowConfigs,
  type ThresholdSegment,
  type WindowConfig,
} from './threshold-segments.js';

export type ProjectionRunDependencies = {
  readonly runs: Pick<RunRepository, 'findRun'>;
  readonly strategies: Pick<StrategyRepository, 'findVersion'>;
  readonly results: Pick<RunResultRepository, 'listWindows'>;
  // A corretora das velas (o backtest e o ao vivo leem a mesma série pública).
  readonly exchange: string;
};

// Tudo o que as duas rotas da spec 009 precisam da execução, da versão da estratégia e das janelas, lido uma vez.
export type ProjectionContext = {
  readonly run: RunRecord;
  readonly config: StrategyConfig;
  readonly durationMilliseconds: number;
  readonly windowConfigs: readonly WindowConfig[];
  // A faixa em que a execução tem decisões (ADR 0002, spec 005, O1); `undefined` = nada processado ainda.
  readonly runRange: TimeRange | undefined;
  readonly segments: readonly ThresholdSegment[];
  readonly market: DecisionMarket;
};

// Timeframe fora do vocabulário é dado corrompido: a execução nasceu validada.
export function readDurationMilliseconds(timeframe: string): number {
  const known = Object.values(ENGINE_TIMEFRAME).find((candidate) => candidate === timeframe);
  if (known === undefined) throw new Error('Timeframe da execução desconhecido.');
  return ENGINE_TIMEFRAME_DURATION_MILLISECONDS[known];
}

async function readWindows(
  dependencies: ProjectionRunDependencies,
  params: { readonly scope: OwnerScope; readonly run: RunRecord },
): Promise<readonly WalkForwardWindowInput[]> {
  if (params.run.kind !== RUN_KIND.WALK_FORWARD) return [];
  const page = await dependencies.results.listWindows(params.scope, params.run.id, {
    limit: CHART_WINDOW_READ_LIMIT,
    after: undefined,
  });
  if (page === undefined) throw new RunNotFoundError();
  return page.items;
}

// Execução alheia, inexistente ou apagada é o mesmo 404 (ADR 0002, spec 009, P11); qualquer tipo de execução responde.
// A versão e as janelas vão juntas DEPOIS da execução do dono: a versão da estratégia da execução sempre existe (FK composta).
export async function readProjectionContext(
  dependencies: ProjectionRunDependencies,
  params: { readonly scope: OwnerScope; readonly runId: string },
): Promise<ProjectionContext> {
  const { scope } = params;
  const run = await dependencies.runs.findRun(scope, params.runId);
  if (run === undefined) throw new RunNotFoundError();
  const [version, windows] = await Promise.all([
    dependencies.strategies.findVersion(scope, run.strategyVersionId),
    readWindows(dependencies, { scope, run }),
  ]);
  if (version === undefined) throw new Error('Versão da estratégia da execução ausente.');
  const config = parseStrategyConfig(version.config);
  const durationMilliseconds = readDurationMilliseconds(run.timeframe);
  const runRange = resolveRunRange(run, windows);
  const windowConfigs = deriveWindowConfigs(config, windows);
  return {
    run,
    config,
    durationMilliseconds,
    windowConfigs,
    runRange,
    segments: buildThresholdSegments({
      run,
      base: config,
      runRange,
      durationMilliseconds,
      windowConfigs,
    }),
    market: { exchange: dependencies.exchange, symbol: run.symbol, timeframe: run.timeframe },
  };
}
