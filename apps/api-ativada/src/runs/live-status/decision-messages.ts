// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  ruleIndicatorId,
  ruleLabel,
  SIGNAL_ACTION,
  toEngineDecimal,
  type SignalAction,
  type SignalVote,
  type StrategyConfig,
  type StrategyRule,
} from '@ativada/strategy-engine';

import { describeRuleCondition } from './decision-condition.js';
import { joinNames, formatPoints, pluralizePoints } from './live-number-format.js';
import { DECISION_OUTCOME, type DecisionOutcome } from './live-status.constant.js';
import type { IndicatorRecord } from './stored-readings.js';

export type DecisionMessageParams = {
  readonly config: StrategyConfig;
  readonly action: SignalAction;
  // A carteira estava comprada ao fechar a vela (ADR 0002, spec 008, L12).
  readonly isHolding: boolean;
  readonly score: string;
  readonly votes: readonly SignalVote[];
  readonly indicators: IndicatorRecord;
};

type Entry = { readonly rule: StrategyRule; readonly vote: SignalVote };

const BUY_REPEATED = 'Esperou: já está comprada; a compra não se repete.';
const NOTHING_TO_SELL = 'Esperou: não há posição para vender.';
const MISSING_SENTIMENT = 'Sem leitura do Fear & Greed nas últimas 48 h: a regra ficou neutra.';

// BUY livre compra e SELL comprada vende; todo o resto é esperar (ADR 0002, spec 008, L12).
export function resolveDecisionOutcome(params: {
  readonly action: SignalAction;
  readonly isHolding: boolean;
}): DecisionOutcome {
  if (params.action === SIGNAL_ACTION.BUY && !params.isHolding) return DECISION_OUTCOME.BOUGHT;
  if (params.action === SIGNAL_ACTION.SELL && params.isHolding) return DECISION_OUTCOME.SOLD;
  return DECISION_OUTCOME.WAITED;
}

// As regras na ordem da configuração, cada uma com o voto gravado dela.
function pairEntries(config: StrategyConfig, votes: readonly SignalVote[]): readonly Entry[] {
  return config.rules.flatMap((rule) => {
    const vote = votes.find((candidate) => candidate.ruleId === rule.id);
    return vote === undefined ? [] : [{ rule, vote }];
  });
}

const hasWeight = (entry: Entry): boolean => !toEngineDecimal(entry.vote.weight).isZero();

function labelsOf(entries: readonly Entry[]): string {
  return joinNames(entries.map((entry) => ruleLabel(entry.rule)));
}

function describeSide(entries: readonly Entry[], side: 1 | -1): string {
  const counted = entries.filter(hasWeight);
  const onSide = counted.filter((entry) => entry.vote.vote === side);
  const noun = counted.length === 1 ? 'regra' : 'regras';
  const direction = side === 1 ? 'a favor' : 'contra';
  return `${onSide.length} de ${counted.length} ${noun} ${direction} (${labelsOf(onSide)})`;
}

// A regra que mais segurou a compra: contra ou neutra, com peso, de maior peso; empate fica com a primeira.
function findHeaviestHolder(entries: readonly Entry[]): Entry | undefined {
  const holders = entries.filter(
    (entry) => hasWeight(entry) && !entry.vote.isMissing && entry.vote.vote <= 0,
  );
  return holders.reduce<Entry | undefined>(
    (heaviest, entry) =>
      heaviest === undefined || toEngineDecimal(entry.vote.weight).greaterThan(heaviest.vote.weight)
        ? entry
        : heaviest,
    undefined,
  );
}

function describeWaiting(params: DecisionMessageParams, entries: readonly Entry[]): string {
  const missing = toEngineDecimal(params.config.thresholds.buy).minus(params.score).toFixed();
  const lead = `Faltou ${formatPoints(missing)} ${pluralizePoints(missing)}`;
  const holder = findHeaviestHolder(entries);
  if (holder === undefined || holder.vote.vote === 1) return `${lead}.`;
  const reading = params.indicators[ruleIndicatorId(holder.rule.id)] ?? undefined;
  return `${lead}: ${describeRuleCondition({ rule: holder.rule, vote: holder.vote.vote, reading })}.`;
}

function describeHolding(params: DecisionMessageParams): string {
  const sell = formatPoints(params.config.thresholds.sell);
  return `Esperou: já está comprada; a venda pede pontuação ${sell} e está em ${formatPoints(params.score)}.`;
}

function describeMain(params: DecisionMessageParams, entries: readonly Entry[]): string {
  const { action, isHolding } = params;
  if (action === SIGNAL_ACTION.BUY) {
    return isHolding ? BUY_REPEATED : `Comprou: ${describeSide(entries, 1)}.`;
  }
  if (action === SIGNAL_ACTION.SELL) {
    return isHolding ? `Vendeu: ${describeSide(entries, -1)}.` : NOTHING_TO_SELL;
  }
  return isHolding ? describeHolding(params) : describeWaiting(params, entries);
}

function describeExtras(entries: readonly Entry[]): readonly string[] {
  const filtered = entries.filter((entry) => !hasWeight(entry));
  const regime =
    filtered.length === 0
      ? []
      : [`O filtro de tendência (ADX) deixou ${labelsOf(filtered)} de fora.`];
  const sentiment = entries.some((entry) => entry.vote.isMissing) ? [MISSING_SENTIMENT] : [];
  return [...regime, ...sentiment];
}

// A frase do motivo da vela (ADR 0002, spec 008, L14), montada só do que ficou gravado: nada é recalculado.
export function buildDecisionMessage(params: DecisionMessageParams): string {
  const entries = pairEntries(params.config, params.votes);
  return [describeMain(params, entries), ...describeExtras(entries)].join(' ');
}
