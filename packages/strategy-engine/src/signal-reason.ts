// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatEngineDecimal, type EngineDecimalValue } from './engine-decimal.js';
import { REGIME, SIGNAL_ACTION, type SignalAction } from './engine-vocabulary.constant.js';
import { formatTruncatedAdx, type ResolvedRegime } from './regime.js';
import type { Vote } from './rule-vote.js';

const REASON_SEPARATOR = ' · ';
const NAME_SEPARATOR = ', ';
const NO_RULES = 'nenhuma';
const NO_REGIME_FILTER = 'sem filtro de regime';
const ACTION_LABEL: Readonly<Record<SignalAction, string>> = {
  [SIGNAL_ACTION.BUY]: 'Compra',
  [SIGNAL_ACTION.SELL]: 'Venda',
  [SIGNAL_ACTION.HOLD]: 'Neutro',
};
const REGIME_LABEL = { [REGIME.TRENDING]: 'tendência', [REGIME.RANGING]: 'lateral' } as const;

export type ReasonVote = {
  readonly label: string;
  readonly vote: Vote;
  readonly isMissing: boolean;
};

export type BuildSignalReasonParams = {
  readonly action: SignalAction;
  readonly score: EngineDecimalValue;
  readonly regime: ResolvedRegime;
  readonly votes: readonly ReasonVote[];
};

function describeRegime(resolved: ResolvedRegime): string {
  if (resolved.regime === REGIME.NONE || resolved.adx === null) return NO_REGIME_FILTER;
  return `${REGIME_LABEL[resolved.regime]} (ADX ${formatTruncatedAdx(resolved.adx)})`;
}

// Sinal explícito nos positivos; "0" sem sinal; ponto como separador decimal.
function describeScore(score: EngineDecimalValue): string {
  const text = formatEngineDecimal(score);
  return score.greaterThan(0) ? `+${text}` : text;
}

function namesWithVote(votes: readonly ReasonVote[], vote: Vote): string {
  const names = votes
    .filter((candidate) => !candidate.isMissing && candidate.vote === vote)
    .map((candidate) => candidate.label);
  return names.length === 0 ? NO_RULES : names.join(NAME_SEPARATOR);
}

// `<Ação> · pontuação <±N> · <regime> · compra: … · venda: … · neutras: …[ · sem dado: …]`; regras na
// ordem da configuração. Determinístico: nada de `toLocale*` nem `Intl`.
export function buildSignalReason(params: BuildSignalReasonParams): string {
  const { votes } = params;
  const missing = votes.filter((vote) => vote.isMissing).map((vote) => vote.label);
  const segments = [
    ACTION_LABEL[params.action],
    `pontuação ${describeScore(params.score)}`,
    describeRegime(params.regime),
    `compra: ${namesWithVote(votes, 1)}`,
    `venda: ${namesWithVote(votes, -1)}`,
    `neutras: ${namesWithVote(votes, 0)}`,
  ];
  if (missing.length > 0) segments.push(`sem dado: ${missing.join(NAME_SEPARATOR)}`);
  return segments.join(REASON_SEPARATOR);
}
