// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatPrice } from '../../format/format.js';
import { MODEL_TEAM_VISUAL, type TeamAction } from '../model-teams/model-teams.constant.js';
import type {
  ComparisonItem,
  Recommendation,
  TeamState,
} from '../model-teams/model-teams.validation.js';
import { toDrawingNumber, toSurfaceTime } from './candle-series.js';
import type { SurfaceLevelBox, SurfaceTeamPlaque } from './chart-surface.types.js';
import { validityStart, type DisplayMapping } from './display-mapping.js';

export const TEAM_LAYER_NOTICE =
  'Equipes ◆: a plaquinha é a indicação do modelo na vela decidida e a faixa (entrada, alvo, proteção) vale só para a vela seguinte de 15 min. Não é ordem nem recomendação: tendência, não promessa.';

const ACTION_WORD: Readonly<Record<TeamAction, string>> = {
  buy: '↗ comprar',
  sell: '↘ vender',
  hold: '— esperar',
};

export type TeamLayerInput = {
  readonly comparison: readonly ComparisonItem[];
  readonly teams: readonly TeamState[];
  // Vela de exibição (3 min): a opinião aparece onde passou a valer.
  readonly mapping: DisplayMapping | undefined;
  // A vela da execução, em ms (15 min).
  readonly runMilliseconds: number;
  // O fim (ms) das velas que o gráfico tem: a faixa que ainda vale vai até a ponta.
  readonly chartEnd: number | undefined;
};

export type TeamLayer = {
  readonly plaques: readonly SurfaceTeamPlaque[];
  readonly boxes: readonly SurfaceLevelBox[];
  // Linhas do balão, pela abertura da vela DECIDIDA (a mesma chave da decisão da estratégia).
  readonly notes: ReadonlyMap<number, readonly string[]>;
};

function plaqueTime(decidedOpen: number, mapping: DisplayMapping | undefined): number {
  return toSurfaceTime(mapping === undefined ? decidedOpen : validityStart(decidedOpen, mapping));
}

// Uma plaquinha por equipe que decidiu naquela vela: ícone + palavra + inicial (nunca só cor). Falha, pulo e pendente não desenham.
export function buildPlaques(input: TeamLayerInput): SurfaceTeamPlaque[] {
  return input.comparison.flatMap((item) =>
    item.teams.flatMap((row) => {
      if (row.status !== 'decided' || row.action === null) return [];
      return [
        {
          key: `${row.teamKey}:${item.candleTime}`,
          time: plaqueTime(item.candleTime, input.mapping),
          text: `◆${MODEL_TEAM_VISUAL[row.teamKey].initial} ${ACTION_WORD[row.action]}`,
          action: row.action,
        },
      ];
    }),
  );
}

function lastBuy(state: TeamState): Recommendation | undefined {
  return state.recent.find(
    (item) => item.status === 'decided' && item.action === 'buy' && item.levels !== null,
  );
}

// A faixa da ÚLTIMA compra recomendada de cada equipe: vale em `[t + 15 min, t + 30 min)`, nunca antes do fechamento de `t`.
export function buildBands(input: TeamLayerInput): SurfaceLevelBox[] {
  const { runMilliseconds, chartEnd } = input;
  return input.teams.flatMap((state) => {
    const buy = lastBuy(state);
    const levels = buy?.levels;
    if (buy === undefined || levels === null || levels === undefined) return [];
    const from = buy.candleTime + runMilliseconds;
    const to = from + runMilliseconds;
    const isStillValid = chartEnd === undefined || to > chartEnd;
    return [
      {
        key: `team:${state.team.teamKey}:${buy.candleTime}`,
        entryTime: toSurfaceTime(from),
        exitTime: isStillValid ? null : toSurfaceTime(to),
        entry: toDrawingNumber(levels.entryPrice),
        stop: toDrawingNumber(levels.stopPrice),
        target: toDrawingNumber(levels.targetPrice),
        tag: `◆${MODEL_TEAM_VISUAL[state.team.teamKey].initial}`,
      },
    ];
  });
}

function levelsText(buy: Recommendation | undefined): string {
  const levels = buy?.levels;
  if (levels === null || levels === undefined) return '';
  const { entryPrice, targetPrice, stopPrice } = levels;
  return ` · entrada ${formatPrice(entryPrice)} · alvo ${formatPrice(targetPrice)} · proteção ${formatPrice(stopPrice)}`;
}

// "◆ Nina: comprar" por equipe na vela decidida, com os preços quando a ficha ainda os tem (as últimas recomendações).
export function buildNotes(input: TeamLayerInput): Map<number, readonly string[]> {
  const notes = new Map<number, readonly string[]>();
  for (const item of input.comparison) {
    const lines = item.teams.flatMap((row) => {
      if (row.status !== 'decided' || row.action === null) return [];
      const state = input.teams.find((team) => team.team.teamKey === row.teamKey);
      const same = state?.recent.find((report) => report.candleTime === item.candleTime);
      const name = MODEL_TEAM_VISUAL[row.teamKey].name;
      return [`◆ ${name}: ${ACTION_WORD[row.action]}${levelsText(same)}`];
    });
    if (lines.length > 0) notes.set(item.candleTime, lines);
  }
  return notes;
}

export function buildTeamLayer(input: TeamLayerInput): TeamLayer {
  return {
    plaques: buildPlaques(input),
    boxes: buildBands(input),
    notes: buildNotes(input),
  };
}
