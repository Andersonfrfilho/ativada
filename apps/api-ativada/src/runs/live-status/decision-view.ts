// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { DecisionRow, PositionInput } from '@ativada/database';
import { z } from '@ativada/environment';
import {
  decimalFromIndicator,
  formatEngineDecimal,
  ruleIndicatorId,
  ruleLabel,
  STRATEGY_FAMILY,
  toEngineDecimal,
  type SignalVote,
  type StrategyConfig,
} from '@ativada/strategy-engine';

import { readCandleState } from './decision-candle-state.js';
import { buildDecisionMessage, resolveDecisionOutcome } from './decision-messages.js';
import type { DecisionView, DecisionVoteView } from './live-status-view.js';
import {
  readIndicatorRecord,
  unflattenIndicator,
  type IndicatorRecord,
} from './stored-readings.js';

const STORED_VOTES_SCHEMA = z.array(
  z.object({
    ruleId: z.string(),
    family: z.enum(STRATEGY_FAMILY),
    vote: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
    weight: z.string(),
    isMissing: z.boolean(),
  }),
);

export type DecisionViewParams = {
  readonly config: StrategyConfig;
  readonly durationMilliseconds: number;
  readonly lastCandleTime: number | undefined;
  // As posições abertas e as que cruzam a página: o bastante para saber se estava comprada em cada vela.
  readonly positions: readonly PositionInput[];
  readonly rows: readonly DecisionRow[];
};

const canonical = (text: string): string => formatEngineDecimal(toEngineDecimal(text));

// A leitura gravada da regra em texto: uma saída vira `{ value }`; várias, uma chave por saída; sem leitura, `null`.
function readRuleReading(
  indicators: IndicatorRecord,
  ruleId: string,
): Readonly<Record<string, string>> | null {
  const value = unflattenIndicator(indicators, ruleIndicatorId(ruleId));
  const toText = (reading: number): string => formatEngineDecimal(decimalFromIndicator(reading));
  if (value === undefined) return null;
  if (typeof value === 'number') return { value: toText(value) };
  return Object.fromEntries(
    Object.entries(value).map(([output, reading]) => [output, toText(reading)]),
  );
}

function toVoteViews(
  config: StrategyConfig,
  votes: readonly SignalVote[],
  indicators: IndicatorRecord,
): readonly DecisionVoteView[] {
  return config.rules.flatMap((rule) => {
    const vote = votes.find((candidate) => candidate.ruleId === rule.id);
    if (vote === undefined) return [];
    return [
      {
        ruleId: rule.id,
        label: ruleLabel(rule),
        kind: rule.kind,
        vote: vote.vote,
        weight: canonical(vote.weight),
        isMissing: vote.isMissing,
        reading: readRuleReading(indicators, rule.id),
      },
    ];
  });
}

function toDecisionView(params: DecisionViewParams, row: DecisionRow): DecisionView {
  const { config } = params;
  const state = readCandleState({
    positions: params.positions,
    candleTime: row.candleTime,
    durationMilliseconds: params.durationMilliseconds,
    lastCandleTime: params.lastCandleTime,
  });
  const { isHolding } = state;
  const outcome = resolveDecisionOutcome({ action: row.action, state });
  const votes = STORED_VOTES_SCHEMA.parse(row.votes);
  const indicators = readIndicatorRecord(row.indicators);
  const score = canonical(row.score);
  return {
    candleTime: row.candleTime,
    closedAt: row.candleTime + params.durationMilliseconds,
    close: canonical(row.close),
    action: row.action,
    outcome,
    score,
    scoreThreshold: canonical(isHolding ? config.thresholds.sell : config.thresholds.buy),
    regime: row.regime,
    message: buildDecisionMessage({
      config,
      action: row.action,
      isHolding,
      outcome,
      exit: state.exit,
      score,
      votes,
      indicators,
    }),
    technicalReason: row.reason,
    votes: toVoteViews(config, votes, indicators),
  };
}

// As decisões da página, da mais recente para a mais antiga, com a frase de cada uma.
export function toDecisionViews(params: DecisionViewParams): readonly DecisionView[] {
  return params.rows.map((row) => toDecisionView(params, row));
}
