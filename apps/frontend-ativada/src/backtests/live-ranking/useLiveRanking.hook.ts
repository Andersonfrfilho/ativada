// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useLiveSummaryQuery } from '../../overview/live-summary.query.js';
import { RUN_KIND } from '../../runs/run.constant.js';
import { useRunListQuery } from '../../runs/runs.query.js';
import { buildRanking, type RankingEntry } from './live-ranking.js';

// Reaproveita a lista `live_paper` do trocador (mesma chave de cache) e o resumo agregado da Visão geral: nenhum pedido por linha.
export function useLiveRanking(currentId: string): readonly RankingEntry[] {
  const list = useRunListQuery(RUN_KIND.LIVE_PAPER, undefined, true);
  const summary = useLiveSummaryQuery();
  const runs = list.data?.pages.flatMap((page) => page.items) ?? [];
  return buildRanking(runs, summary.data ?? [], currentId);
}
