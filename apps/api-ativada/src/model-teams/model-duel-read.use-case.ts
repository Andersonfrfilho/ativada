// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  DuelEquityPoint,
  ModelDuelRepository,
  ModelTeamReadRepository,
  OwnerScope,
  RunRecord,
} from '@ativada/database';
import { COMPARISON_NOTICE, DUEL_NOTICE, readSignalSource } from '@ativada/model-agents';
import { EngineDecimal, formatEngineDecimal, parseRunParameters } from '@ativada/strategy-engine';

import { DuelNotFoundError } from './model-team.error.js';
import {
  MODEL_TEAM_FAILURE_HOURS,
  MODEL_TEAM_RECENT_REPORTS,
  MODEL_TEAM_SCOREBOARD_DAYS,
} from './model-team.constant.js';
import { toScoreboard } from './model-team-view.js';
import type { DuelRankingRow, DuelRunView, ModelDuelView } from './model-duel.schema.js';

const DECIMAL_PLACES = 8;

export type ModelDuelReadDependencies = {
  readonly duels: Pick<
    ModelDuelRepository,
    'listDuelRuns' | 'readEquityCurves' | 'countClosedTrades'
  >;
  readonly reports: Pick<ModelTeamReadRepository, 'readOverview'>;
  readonly exchange: string;
};

export type ModelDuelReadUseCase = (scope: OwnerScope, duelId: string) => Promise<ModelDuelView>;

function toRunView(run: RunRecord): DuelRunView {
  const source = readSignalSource(run.request);
  return {
    runId: run.id,
    team: source?.team ?? null,
    signalSource: source ?? null,
    status: run.status,
    lastCandleTime: run.lastCandleTime ?? null,
    createdAt: run.createdAt.toISOString(),
  };
}

// Retorno sobre o saldo (para baixo) e a pior perda na mínima contra o pico do fechamento (para cima): sempre contra o usuário.
function summarizeCurve(
  points: readonly DuelEquityPoint[],
  initialBalance: string,
): { readonly returnRate: string | null; readonly maxDrawdown: string | null } {
  const last = points.at(-1);
  if (last === undefined) return { returnRate: null, maxDrawdown: null };
  const initial = new EngineDecimal(initialBalance);
  const returnRate = new EngineDecimal(last.equity).minus(initial).dividedBy(initial);
  let peak = initial;
  let worst = new EngineDecimal(0);
  for (const point of points) {
    peak = EngineDecimal.max(peak, point.equity);
    const drawdown = peak.minus(point.equityAtLow).dividedBy(peak);
    worst = EngineDecimal.max(worst, drawdown);
  }
  return {
    returnRate: formatEngineDecimal(
      returnRate.toDecimalPlaces(DECIMAL_PLACES, EngineDecimal.ROUND_FLOOR),
    ),
    maxDrawdown: formatEngineDecimal(
      worst.toDecimalPlaces(DECIMAL_PLACES, EngineDecimal.ROUND_CEIL),
    ),
  };
}

function toCurves(
  points: readonly DuelEquityPoint[],
  runIds: readonly string[],
): {
  readonly candleTimes: number[];
  readonly curves: ModelDuelView['curves'];
} {
  const candleTimes = [...new Set(points.map((point) => point.candleTime))].sort((a, b) => a - b);
  const byRun = new Map(runIds.map((runId) => [runId, new Map<number, string>()]));
  for (const point of points) byRun.get(point.runId)?.set(point.candleTime, point.equity);
  return {
    candleTimes,
    curves: runIds.map((runId) => ({
      runId,
      equity: candleTimes.map((time) => byRun.get(runId)?.get(time) ?? null),
    })),
  };
}

type RankingParams = {
  readonly run: RecordWithPoints;
  readonly trades: number;
  readonly overview: Awaited<ReturnType<ModelTeamReadRepository['readOverview']>>;
};

type RecordWithPoints = { readonly record: RunRecord; readonly points: readonly DuelEquityPoint[] };

function toRankingRow(params: RankingParams): DuelRankingRow {
  const { record, points } = params.run;
  const team = readSignalSource(record.request)?.team ?? null;
  const spend = params.overview.spend.find((row) => row.teamKey === team);
  const summary = summarizeCurve(points, parseRunParameters(record.runParameters).initialBalance);
  return {
    runId: record.id,
    team,
    ...summary,
    trades: params.trades,
    scoreboard:
      team === null
        ? null
        : toScoreboard(params.overview.scores.find((row) => row.teamKey === team)),
    apiCost:
      team === null ? null : { todayUsd: spend?.dayUsd ?? '0', monthUsd: spend?.monthUsd ?? '0' },
  };
}

// O duelo (RF21): as execuções do grupo, as curvas de patrimônio alinhadas por vela e o ranking. Quatro consultas por chave (as
// execuções do dono, as curvas, as operações fechadas e a visão das equipes do par), sem cache. Duelo alheio, inexistente ou id
// malformado é o mesmo 404. O ranking mede retorno e perda; o acerto de lado fica ao lado, com o Wilson.
export function createModelDuelReadUseCase(
  dependencies: ModelDuelReadDependencies,
): ModelDuelReadUseCase {
  return async (scope, duelId) => {
    const runs = await dependencies.duels.listDuelRuns(scope, duelId);
    const first = runs[0];
    if (first === undefined) throw new DuelNotFoundError();
    const runIds = runs.map((run) => run.id);
    const [points, trades, overview] = await Promise.all([
      dependencies.duels.readEquityCurves(scope, runIds),
      dependencies.duels.countClosedTrades(scope, runIds),
      dependencies.reports.readOverview({
        exchange: dependencies.exchange,
        symbol: first.symbol,
        limitPerTeam: MODEL_TEAM_RECENT_REPORTS,
        onDemandIds: [],
        scoreboardDays: MODEL_TEAM_SCOREBOARD_DAYS,
        failureHours: MODEL_TEAM_FAILURE_HOURS,
      }),
    ]);
    const { candleTimes, curves } = toCurves(points, runIds);
    return {
      duelId,
      symbol: first.symbol,
      notice: DUEL_NOTICE,
      comparisonNotice: COMPARISON_NOTICE,
      runs: runs.map(toRunView),
      candleTimes,
      curves,
      ranking: runs.map((record) =>
        toRankingRow({
          run: { record, points: points.filter((point) => point.runId === record.id) },
          trades: trades.find((item) => item.runId === record.id)?.trades ?? 0,
          overview,
        }),
      ),
    };
  };
}
