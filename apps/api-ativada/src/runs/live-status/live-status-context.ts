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

type FindRunParams = {
  readonly scope: OwnerScope;
  readonly runId: string;
  readonly kinds: ReadonlySet<string>;
};

// Execução alheia, inexistente ou apagada é o mesmo 404; o dono certo com tipo fora de `kinds` é 409 (ADR 0002, L17).
async function findRunOfKinds(
  dependencies: LiveStatusRunDependencies,
  params: FindRunParams,
): Promise<RunRecord> {
  const run = await dependencies.runs.findRun(params.scope, params.runId);
  if (run === undefined) throw new RunNotFoundError();
  if (!params.kinds.has(run.kind)) throw new RunNotLiveError();
  return run;
}

const LIVE_RUN_KINDS: ReadonlySet<string> = new Set([RUN_KIND.LIVE_PAPER]);

// Os tipos que gravam um sinal por vela (votos e leituras): hoje todos; quem não gravar continua em 409.
const SIGNAL_RUN_KINDS: ReadonlySet<string> = new Set([
  RUN_KIND.LIVE_PAPER,
  RUN_KIND.BACKTEST,
  RUN_KIND.WALK_FORWARD,
]);

type FindRunParamsWithoutKinds = Omit<FindRunParams, 'kinds'>;

// O acompanhamento (`live-status`, analista) só existe para a simulação ao vivo.
export function findLiveRun(
  dependencies: LiveStatusRunDependencies,
  params: FindRunParamsWithoutKinds,
): Promise<RunRecord> {
  return findRunOfKinds(dependencies, { ...params, kinds: LIVE_RUN_KINDS });
}

// As decisões por vela (`/decisions`) valem para toda execução que grava sinais, ao vivo ou histórica.
export function findSignalRun(
  dependencies: LiveStatusRunDependencies,
  params: FindRunParamsWithoutKinds,
): Promise<RunRecord> {
  return findRunOfKinds(dependencies, { ...params, kinds: SIGNAL_RUN_KINDS });
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
