// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  RUN_KIND,
  type OwnerScope,
  type RunRecord,
  type RunResultRepository,
} from '@ativada/database';
import {
  computeBalanceSurvival,
  describeSurvivalLevels,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  parseRunParameters,
  parseSurvivalSettings,
  type BalanceSurvival,
  type SurvivalPoint,
} from '@ativada/strategy-engine';

export type RunSurvivalDependencies = {
  readonly results: Pick<RunResultRepository, 'listSurvivalPoints'>;
};

type SurvivalRun = Pick<RunRecord, 'kind' | 'id' | 'periodStart' | 'runParameters' | 'request'>;

function readSettingsInput(request: RunRecord['request']): unknown {
  if (typeof request !== 'object' || request === null || Array.isArray(request)) return undefined;
  return Object.getOwnPropertyDescriptor(request, 'survival')?.value;
}

// Sobrevivência do saldo de uma execução ao vivo (RF09) a partir dos pontos de patrimônio; `null` nos demais tipos.
// O piso e a meta vêm do pedido da execução (`runs.request.survival`, validado na criação) ou do padrão do RF09.
export function describeRunSurvival(
  run: SurvivalRun,
  points: readonly SurvivalPoint[],
): BalanceSurvival | null {
  if (run.kind !== RUN_KIND.LIVE_PAPER) return null;
  const parameters = parseRunParameters(run.runParameters);
  return computeBalanceSurvival({
    initialBalance: parameters.initialBalance,
    startTime: run.periodStart,
    durationMilliseconds: ENGINE_TIMEFRAME_DURATION_MILLISECONDS[parameters.timeframe],
    settings: parseSurvivalSettings(readSettingsInput(run.request)),
    points,
  });
}

// O banco decide, por agregação, quais poucos pontos da curva bastam (primeiro a tocar o piso, primeiro a alcançar a meta, vale,
// pico e último) e a função pura os recebe no lugar da série: a resposta é a mesma e o custo não cresce com a execução.
export async function readRunSurvival(
  dependencies: RunSurvivalDependencies,
  params: { readonly scope: OwnerScope; readonly run: SurvivalRun },
): Promise<BalanceSurvival | null> {
  const { run } = params;
  if (run.kind !== RUN_KIND.LIVE_PAPER) return null;
  const parameters = parseRunParameters(run.runParameters);
  const levels = describeSurvivalLevels({
    initialBalance: parameters.initialBalance,
    settings: parseSurvivalSettings(readSettingsInput(run.request)),
  });
  const points = await dependencies.results.listSurvivalPoints(params.scope, run.id, {
    startTime: run.periodStart,
    ...levels,
  });
  return describeRunSurvival(
    run,
    (points ?? []).map((point) => ({
      candleOpenTime: point.candleTime,
      equity: point.equity,
      equityAtLow: point.equityAtLow,
    })),
  );
}
