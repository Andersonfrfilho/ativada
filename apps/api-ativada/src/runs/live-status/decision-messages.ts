// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { PositionInput } from '@ativada/database';
import {
  EXIT_REASON,
  ruleIndicatorId,
  ruleLabel,
  SIGNAL_ACTION,
  toEngineDecimal,
  type SignalAction,
  type SignalVote,
  type StrategyConfig,
  type StrategyRule,
} from '@ativada/strategy-engine';

import type { CandleState } from './decision-candle-state.js';
import { describeRuleCondition } from './decision-condition.js';
import { formatPoints, formatPrice, joinNames, pluralizePoints } from './live-number-format.js';
import { DECISION_OUTCOME, type DecisionOutcome } from './live-status.constant.js';
import type { IndicatorRecord } from './stored-readings.js';

export type DecisionMessageParams = {
  readonly config: StrategyConfig;
  readonly action: SignalAction;
  // A carteira estava comprada ao fechar a vela (ADR 0002, spec 008, L12).
  readonly isHolding: boolean;
  readonly outcome: DecisionOutcome;
  // A posição que saiu nesta vela por alvo, stop, lacuna ou comando (sem sinal de venda).
  readonly exit: PositionInput | undefined;
  readonly score: string;
  readonly votes: readonly SignalVote[];
  readonly indicators: IndicatorRecord;
};

type Entry = { readonly rule: StrategyRule; readonly vote: SignalVote };

const BUY_REPEATED = 'Esperou: já está comprada; a compra não se repete.';
const NOTHING_TO_SELL = 'Esperou: não há posição para vender.';
const MISSING_SENTIMENT = 'Sem leitura do Fear & Greed nas últimas 48 h: a regra ficou neutra.';

const BUY_PENDING = 'Pediu compra: executa na abertura da próxima vela.';
const BUY_NOT_EXECUTED = 'Sinal de compra sem execução.';
const GAP_EXIT = 'Saiu pela lacuna de dados.';
const COMMAND_EXIT = 'Saiu porque a meta terminou.';

// BUY livre compra se a ordem preencheu (na última vela ainda está pendente), SELL comprada vende e alvo, stop, lacuna ou
// comando saem sem sinal; todo o resto é esperar (ADR 0002, spec 008, L12 e L21).
export function resolveDecisionOutcome(params: {
  readonly action: SignalAction;
  readonly state: CandleState;
}): DecisionOutcome {
  const { action, state } = params;
  if (state.exit !== undefined) return DECISION_OUTCOME.EXITED;
  if (action === SIGNAL_ACTION.SELL && state.isHolding) return DECISION_OUTCOME.SOLD;
  if (action !== SIGNAL_ACTION.BUY || state.isHolding) return DECISION_OUTCOME.WAITED;
  if (state.isBuyFilled) return DECISION_OUTCOME.BOUGHT;
  return state.isLastCandle ? DECISION_OUTCOME.BUY_PENDING : DECISION_OUTCOME.WAITED;
}

function describeExit(exit: PositionInput): string {
  if (exit.exitReason === EXIT_REASON.TARGET)
    return `Vendeu no alvo (${formatPrice(exit.targetPrice)}).`;
  if (exit.exitReason === EXIT_REASON.STOP)
    return `Vendeu no stop (${formatPrice(exit.stopPrice)}).`;
  return exit.exitReason === EXIT_REASON.GAP ? GAP_EXIT : COMMAND_EXIT;
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

type HolderEntry = {
  readonly rule: StrategyRule;
  readonly vote: SignalVote & { readonly vote: 0 | -1 };
};

const isHolder = (entry: Entry): entry is HolderEntry =>
  hasWeight(entry) && !entry.vote.isMissing && entry.vote.vote <= 0;

// A regra que mais segurou a compra: contra ou neutra, com peso, de maior peso; empate fica com a primeira.
function findHeaviestHolder(entries: readonly Entry[]): HolderEntry | undefined {
  return entries
    .filter(isHolder)
    .reduce<HolderEntry | undefined>(
      (heaviest, entry) =>
        heaviest === undefined ||
        toEngineDecimal(entry.vote.weight).greaterThan(heaviest.vote.weight)
          ? entry
          : heaviest,
      undefined,
    );
}

function describeWaiting(params: DecisionMessageParams, entries: readonly Entry[]): string {
  const missing = toEngineDecimal(params.config.thresholds.buy).minus(params.score).toFixed();
  const lead = `Faltou ${formatPoints(missing)} ${pluralizePoints(missing)}`;
  const holder = findHeaviestHolder(entries);
  if (holder === undefined) return `${lead}.`;
  const reading = params.indicators[ruleIndicatorId(holder.rule.id)] ?? undefined;
  return `${lead}: ${describeRuleCondition({ rule: holder.rule, vote: holder.vote.vote, reading })}.`;
}

function describeHolding(params: DecisionMessageParams): string {
  const sell = formatPoints(params.config.thresholds.sell);
  return `Esperou: já está comprada; a venda pede pontuação ${sell} e está em ${formatPoints(params.score)}.`;
}

function describeBuy(params: DecisionMessageParams, entries: readonly Entry[]): string {
  if (params.isHolding) return BUY_REPEATED;
  if (params.outcome === DECISION_OUTCOME.BOUGHT) return `Comprou: ${describeSide(entries, 1)}.`;
  return params.outcome === DECISION_OUTCOME.BUY_PENDING ? BUY_PENDING : BUY_NOT_EXECUTED;
}

function describeMain(params: DecisionMessageParams, entries: readonly Entry[]): string {
  const { action, isHolding, exit } = params;
  if (exit !== undefined) return describeExit(exit);
  if (action === SIGNAL_ACTION.BUY) return describeBuy(params, entries);
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
