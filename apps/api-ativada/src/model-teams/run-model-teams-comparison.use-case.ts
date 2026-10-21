// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  AnalystDecisionRepository,
  CandleRepository,
  ModelTeamReadRepository,
  OwnerScope,
  RunRecord,
  TeamReportRow,
} from '@ativada/database';
import { z } from '@ativada/environment';
import { MODEL_TEAM_KEYS, isModelTeamKey } from '@ativada/model-agents';
import { EngineDecimal } from '@ativada/strategy-engine';

import { STORED_SPECIALIST_SCHEMA } from '../runs/analyst/analyst-blocks.schema.js';
import {
  findLiveRun,
  type LiveStatusRunDependencies,
} from '../runs/live-status/live-status-context.js';
import { encodeTimeCursor } from '../runs/run-cursor.js';
import { MODEL_TEAM_COMPARISON_PAGE } from './model-team.constant.js';
import {
  NEXT_MOVE,
  type ComparisonItemView,
  type ComparisonQuery,
  type NextMove,
} from './run-model-teams-comparison.schema.js';

const CANDLE_MILLISECONDS = 900_000;
const TIMEFRAME = '15m';
const specialistsSchema = z.array(STORED_SPECIALIST_SCHEMA);

export type RunModelTeamsComparisonDependencies = LiveStatusRunDependencies & {
  readonly candles: Pick<CandleRepository, 'findCandles'>;
  readonly analyst: Pick<AnalystDecisionRepository, 'listAnalystDecisionsPage'>;
  readonly reports: Pick<ModelTeamReadRepository, 'listReportsForCandles'>;
};

export type ComparisonPage = {
  readonly items: readonly ComparisonItemView[];
  readonly nextCursor: string | null;
  readonly perPage: number;
};

export type RunModelTeamsComparisonUseCase = (
  scope: OwnerScope,
  runId: string,
  input: { readonly before: number | undefined; readonly query: ComparisonQuery },
) => Promise<ComparisonPage>;

type Closes = ReadonlyMap<number, string>;

function nextMoveOf(close: string, nextClose: string | undefined): NextMove {
  if (nextClose === undefined) return NEXT_MOVE.OPEN;
  const comparison = new EngineDecimal(nextClose).comparedTo(close);
  if (comparison > 0) return NEXT_MOVE.UP;
  return comparison < 0 ? NEXT_MOVE.DOWN : NEXT_MOVE.EQUAL;
}

// ✓/✗ só quando houve lado (compra/voto +1 ou venda/voto −1) e a vela seguinte andou; o resto fica sem marca.
function hitOf(side: 'up' | 'down' | undefined, next: NextMove): boolean | null {
  if (side === undefined) return null;
  if (next !== NEXT_MOVE.UP && next !== NEXT_MOVE.DOWN) return null;
  return side === next;
}

function sideOfAction(action: string | null): 'up' | 'down' | undefined {
  if (action === 'buy') return 'up';
  return action === 'sell' ? 'down' : undefined;
}

function sideOfVote(vote: number | null): 'up' | 'down' | undefined {
  if (vote === 1) return 'up';
  return vote === -1 ? 'down' : undefined;
}

function toTeamRows(
  reports: readonly TeamReportRow[],
  next: NextMove,
): ComparisonItemView['teams'] {
  return MODEL_TEAM_KEYS.map((teamKey) => {
    const report = reports.find((row) => row.teamKey === teamKey);
    const action = report?.action ?? null;
    const known = action === 'buy' || action === 'sell' || action === 'hold' ? action : null;
    const status = report?.status;
    return {
      teamKey,
      status:
        status === 'decided' || status === 'failed' || status === 'skipped' || status === 'pending'
          ? status
          : null,
      action: known,
      isHit: hitOf(sideOfAction(known), next),
    };
  });
}

function toRuleRows(specialists: unknown, next: NextMove): ComparisonItemView['rules'] {
  const parsed = specialistsSchema.safeParse(specialists);
  if (!parsed.success) return null;
  return parsed.data.map((item) => ({
    key: item.key,
    vote: item.vote,
    isHit: hitOf(sideOfVote(item.vote), next),
  }));
}

async function readCloses(
  dependencies: RunModelTeamsComparisonDependencies,
  params: { readonly run: RunRecord; readonly to: number; readonly limit: number },
): Promise<Closes> {
  const from = params.to - params.limit * CANDLE_MILLISECONDS;
  const candles = await dependencies.candles.findCandles({
    exchange: dependencies.exchange,
    symbol: params.run.symbol,
    timeframe: TIMEFRAME,
    from,
    // Uma vela a mais: a seguinte à mais nova da página.
    to: params.to + CANDLE_MILLISECONDS,
    limit: params.limit + 1,
  });
  return new Map(candles.map((candle) => [candle.openTime, candle.close]));
}

type DecisionsPage = Awaited<ReturnType<AnalystDecisionRepository['listAnalystDecisionsPage']>>;

function toItem(params: {
  readonly candleTime: number;
  readonly closes: Closes;
  readonly reports: readonly TeamReportRow[];
  readonly decisions: DecisionsPage | undefined;
}): readonly ComparisonItemView[] {
  const { candleTime, closes } = params;
  const close = closes.get(candleTime);
  if (close === undefined) return [];
  const nextClose = closes.get(candleTime + CANDLE_MILLISECONDS);
  const next = nextMoveOf(close, nextClose);
  const decision = params.decisions?.decisions.find((item) => item.candleTime === candleTime);
  const reports = params.reports.filter(
    (row) => row.candleTime === candleTime && isModelTeamKey(row.teamKey),
  );
  return [
    {
      candleTime,
      closedAt: candleTime + CANDLE_MILLISECONDS,
      close,
      next,
      nextClose: nextClose ?? null,
      rules: decision === undefined ? null : toRuleRows(decision.specialists, next),
      teams: toTeamRows(reports, next),
    },
  ];
}

function toPage(items: readonly ComparisonItemView[], limit: number): ComparisonPage {
  const oldest = items.at(-1);
  return {
    items,
    nextCursor:
      items.length === limit && oldest !== undefined ? encodeTimeCursor(oldest.candleTime) : null,
    perPage: limit,
  };
}

// A tabela "Equipes × regras" (RF21): uma linha por vela de 15 min, da mais nova, com os votos das regras (quando a simulação tem
// analista), a ação de cada equipe e o que a vela seguinte fez. Quatro consultas por página (execução, velas, relatórios e,
// com analista, as decisões). O fechamento é texto exato do banco; ninguém converte para `Number`.
export function createRunModelTeamsComparisonUseCase(
  dependencies: RunModelTeamsComparisonDependencies,
): RunModelTeamsComparisonUseCase {
  return async (scope, runId, input) => {
    const run = await findLiveRun(dependencies, { scope, runId });
    const limit = input.query.limit ?? MODEL_TEAM_COMPARISON_PAGE.DEFAULT;
    const lastTime = run.lastCandleTime;
    if (lastTime === undefined) return { items: [], nextCursor: null, perPage: limit };
    const to = input.before ?? lastTime + CANDLE_MILLISECONDS;
    const closes = await readCloses(dependencies, { run, to, limit });
    const times = [...closes.keys()]
      .filter((time) => time < to)
      .sort((a, b) => b - a)
      .slice(0, limit);
    const hasAnalyst =
      run.request !== undefined && JSON.stringify(run.request).includes('"analyst"');
    const [reports, decisions] = await Promise.all([
      dependencies.reports.listReportsForCandles({ symbol: run.symbol, candleTimes: times }),
      hasAnalyst
        ? dependencies.analyst.listAnalystDecisionsPage(scope, { runId: run.id, limit, before: to })
        : undefined,
    ]);
    const items = times.flatMap((candleTime) => toItem({ candleTime, closes, reports, decisions }));
    return toPage(items, limit);
  };
}
