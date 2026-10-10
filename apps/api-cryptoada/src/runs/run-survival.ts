// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  RUN_KIND,
  type EquityPointInput,
  type OwnerScope,
  type ResultPage,
  type RunRecord,
  type RunResultRepository,
} from '@cryptoada/database';
import {
  computeBalanceSurvival,
  ENGINE_TIMEFRAME_DURATION_MILLISECONDS,
  parseRunParameters,
  parseSurvivalSettings,
  type BalanceSurvival,
  type SurvivalPoint,
} from '@cryptoada/strategy-engine';

export type RunSurvivalDependencies = {
  readonly results: Pick<RunResultRepository, 'listEquityPoints'>;
};

type SurvivalRun = Pick<RunRecord, 'kind' | 'id' | 'periodStart' | 'runParameters' | 'request'>;

const EQUITY_PAGE_SIZE = 5_000;

function readSettingsInput(request: RunRecord['request']): unknown {
  if (typeof request !== 'object' || request === null || Array.isArray(request)) return undefined;
  return Object.getOwnPropertyDescriptor(request, 'survival')?.value;
}

// Os pontos da curva de patrimônio, página a página pelo cursor estável: nada fica de fora nem se repete.
async function readPoints(
  dependencies: RunSurvivalDependencies,
  params: { readonly scope: OwnerScope; readonly runId: string },
): Promise<readonly SurvivalPoint[]> {
  const points: SurvivalPoint[] = [];
  let after: number | undefined;
  for (;;) {
    const page: ResultPage<EquityPointInput, number> | undefined =
      await dependencies.results.listEquityPoints(params.scope, params.runId, {
        limit: EQUITY_PAGE_SIZE,
        after,
      });
    if (page === undefined) return points;
    for (const item of page.items) {
      points.push({
        candleOpenTime: item.candleTime,
        equity: item.equity,
        equityAtLow: item.equityAtLow,
      });
    }
    if (page.nextCursor === undefined) return points;
    after = page.nextCursor;
  }
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

export async function readRunSurvival(
  dependencies: RunSurvivalDependencies,
  params: { readonly scope: OwnerScope; readonly run: SurvivalRun },
): Promise<BalanceSurvival | null> {
  if (params.run.kind !== RUN_KIND.LIVE_PAPER) return null;
  const points = await readPoints(dependencies, { scope: params.scope, runId: params.run.id });
  return describeRunSurvival(params.run, points);
}
