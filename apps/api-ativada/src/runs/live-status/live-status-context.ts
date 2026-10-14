// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  RUN_KIND,
  type DecisionMarket,
  type OwnerScope,
  type RunRecord,
  type RunRepository,
  type StrategyRepository,
} from '@ativada/database';
import {
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  parseRunParameters,
  parseStrategyConfig,
  type RunParameters,
  type StrategyConfig,
} from '@ativada/strategy-engine';

import { RunNotFoundError, RunNotLiveError } from '../run.error.js';

export type LiveStatusRunDependencies = {
  readonly runs: Pick<RunRepository, 'findRun'>;
  readonly strategies: Pick<StrategyRepository, 'findVersion'>;
  // A corretora das velas (a simulação ao vivo lê a mesma série pública do backtest).
  readonly exchange: string;
};

// Tudo o que as contas e as frases precisam da execução e da versão da estratégia dela, lido uma vez.
export type LiveRunContext = {
  readonly run: RunRecord;
  readonly config: StrategyConfig;
  readonly parameters: RunParameters;
  readonly durationMilliseconds: number;
  readonly market: DecisionMarket;
};

// Execução alheia, inexistente ou apagada é o mesmo 404; o dono certo com outro tipo de execução é 409 (ADR 0002, L17).
export async function findLiveRun(
  dependencies: LiveStatusRunDependencies,
  params: { readonly scope: OwnerScope; readonly runId: string },
): Promise<RunRecord> {
  const run = await dependencies.runs.findRun(params.scope, params.runId);
  if (run === undefined) throw new RunNotFoundError();
  if (run.kind !== RUN_KIND.LIVE_PAPER) throw new RunNotLiveError();
  return run;
}

// A vela de cada decisão se acha pela PK de candles: a corretora do ambiente, o par e o timeframe da execução.
export function toDecisionMarket(
  dependencies: Pick<LiveStatusRunDependencies, 'exchange'>,
  run: RunRecord,
): DecisionMarket {
  return { exchange: dependencies.exchange, symbol: run.symbol, timeframe: run.timeframe };
}

// A versão da estratégia da execução: imutável, então sempre existe para uma execução do dono (FK composta).
export async function readLiveContext(
  dependencies: LiveStatusRunDependencies,
  params: { readonly scope: OwnerScope; readonly run: RunRecord },
): Promise<LiveRunContext> {
  const { run } = params;
  const version = await dependencies.strategies.findVersion(params.scope, run.strategyVersionId);
  if (version === undefined) throw new Error('Versão da estratégia da execução ausente.');
  const parameters = parseRunParameters(run.runParameters);
  return {
    run,
    config: parseStrategyConfig(version.config),
    parameters,
    durationMilliseconds: ENGINE_TIMEFRAME_DURATION_MILLISECONDS[parameters.timeframe],
    market: toDecisionMarket(dependencies, run),
  };
}
