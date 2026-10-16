// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatDecimalText } from '../../format/decimal.js';
import { formatIntervalLimitPercent, formatRatePercent } from '../candle-chart/projection-text.js';
import type { ProjectionSummary } from '../candle-chart/projections.validation.js';
import { formatScoreOfThreshold } from '../live-tracking/decision-text.js';
import { OUTCOME_LOOK } from '../live-tracking/DecisionRow.component.js';
import { describeReading } from '../live-tracking/DecisionVotes.component.js';
import type {
  Decision,
  DecisionVote,
  LiveStatus,
} from '../live-tracking/live-status.validation.js';
import { CHIP_TONE } from '../live-tracking/StatusChip.component.js';
import { COIN_FLIP_PERCENT, VERDICT_LOOK } from '../projection-cards/projection-verdict.js';
import {
  familyOfKind,
  FAMILY_LABEL,
  FAMILY_ORDER,
  TEAM_ROOM_TEXT,
  type TeamFamily,
} from './team-room.constant.js';
import type {
  AnalystView,
  AuditorView,
  RiskAnalystView,
  RuleLine,
  SeatLook,
  SeatTone,
  SpecialistView,
  TeamRoomView,
  VoteKind,
} from './team-room.types.js';

const WEIGHT_FORMAT = { minimumFraction: 0, maximumFraction: 2 } as const;
const MINIMUM_COUNTED = 30;
const PLAIN_ZERO = '0';

export const VOTE_LOOK: Readonly<Record<VoteKind, SeatLook>> = {
  favor: { tone: CHIP_TONE.BUY, icon: 'arrowUp', word: 'a favor' },
  against: { tone: CHIP_TONE.SELL, icon: 'arrowDown', word: 'contra' },
  neutral: { tone: CHIP_TONE.NEUTRAL, icon: 'equal', word: 'neutro' },
  unread: { tone: CHIP_TONE.NEUTRAL, icon: 'info', word: 'sem leitura' },
};

type Triggers = LiveStatus['triggers'];

function voteKindOf(vote: DecisionVote): VoteKind {
  if (vote.isMissing) return 'unread';
  if (vote.vote === 1) return 'favor';
  return vote.vote === -1 ? 'against' : 'neutral';
}

function isCountedWeight(weight: string): boolean {
  return formatDecimalText(weight, WEIGHT_FORMAT) !== PLAIN_ZERO;
}

// A frase do servidor para a regra existe só enquanto o acompanhamento fala da vela mais recente.
function motiveOf(ruleId: string, triggers: Triggers | undefined): string | undefined {
  if (triggers === undefined || triggers.status !== 'available') return undefined;
  return triggers.rules.find((rule) => rule.ruleId === ruleId)?.message;
}

function lineOf(vote: DecisionVote, triggers: Triggers | undefined): RuleLine {
  return {
    ruleId: vote.ruleId,
    kind: vote.kind,
    label: vote.label,
    voteKind: voteKindOf(vote),
    weightText: formatDecimalText(vote.weight, WEIGHT_FORMAT),
    isCounted: !vote.isMissing && isCountedWeight(vote.weight),
    motive: motiveOf(vote.ruleId, triggers),
    reading: describeReading(vote.reading),
    values: vote.reading ?? undefined,
  };
}

function toneOf(rules: readonly RuleLine[]): SeatTone {
  const counted = rules.filter((rule) => rule.isCounted);
  if (counted.length === 0) return 'quiet';
  return counted.some((rule) => rule.voteKind === 'favor' || rule.voteKind === 'against')
    ? 'voter'
    : 'normal';
}

// "peso 1" ou "pesos 1 · 2" (os do servidor); sem nenhuma regra que conte, "fora do placar".
function placardOf(rules: readonly RuleLine[]): string {
  const weights = [
    ...new Set(rules.filter((rule) => rule.isCounted).map((rule) => rule.weightText)),
  ];
  if (weights.length === 0) return TEAM_ROOM_TEXT.NOT_VOTING;
  if (weights.length === 1) return `peso ${weights[0] ?? ''}`;
  return `pesos ${weights.join(' · ')}`;
}

function specialistOf(family: TeamFamily, rules: readonly RuleLine[]): SpecialistView {
  return {
    family,
    name: FAMILY_LABEL[family],
    tone: toneOf(rules),
    rules,
    placard: placardOf(rules),
  };
}

function buildSpecialists(decision: Decision, triggers: Triggers | undefined): SpecialistView[] {
  return FAMILY_ORDER.flatMap((family) => {
    const votes = decision.votes.filter((vote) => familyOfKind(vote.kind) === family);
    return votes.length === 0
      ? []
      : [
          specialistOf(
            family,
            votes.map((vote) => lineOf(vote, triggers)),
          ),
        ];
  });
}

function buildAnalyst(decision: Decision): AnalystView {
  return {
    name: TEAM_ROOM_TEXT.ANALYST_NAME,
    outcome: OUTCOME_LOOK[decision.outcome],
    scoreText: formatScoreOfThreshold(decision.score, decision.scoreThreshold),
    message: decision.message,
  };
}

export type TeamRoomViewInput = {
  readonly decision: Decision;
  // Só a vela mais recente leva as frases por regra do acompanhamento (`triggers`); vela revista usa as leituras gravadas.
  readonly triggers: Triggers | undefined;
  readonly riskAnalyst?: RiskAnalystView | undefined;
};

// Do servidor à sala: agrupa as regras da decisão por família e junta os textos prontos. Nada é recalculado.
export function buildTeamRoomView({
  decision,
  triggers,
  riskAnalyst,
}: TeamRoomViewInput): TeamRoomView {
  const specialists = buildSpecialists(decision, triggers);
  return {
    candleTime: decision.candleTime,
    closedAt: decision.closedAt,
    specialists,
    analyst: buildAnalyst(decision),
    riskAnalyst,
    hasOpinion: specialists.some((specialist) => specialist.tone === 'voter'),
  };
}

function intervalTextOf(summary: ProjectionSummary): string | undefined {
  if (summary.wilson === null || summary.verdict === 'too_few') return undefined;
  const lower = formatIntervalLimitPercent(summary.wilson.lower, 'lower');
  const upper = formatIntervalLimitPercent(summary.wilson.upper, 'upper');
  return `Com 95% de confiança, o acerto verdadeiro está entre ${lower} e ${upper}.`;
}

function rateTextOf(summary: ProjectionSummary): string {
  if (summary.counted < MINIMUM_COUNTED || summary.verdict === 'too_few') {
    return `— (${summary.counted} contadas)`;
  }
  return `${formatRatePercent(summary.hitRate)} (${summary.hits} de ${summary.counted})`;
}

// O auditor lê o resumo de acertos que o servidor já calculou (spec 009): o painel só junta as frases.
export function buildAuditorView(summary: ProjectionSummary): AuditorView {
  return {
    look: VERDICT_LOOK[summary.verdict],
    lead: summary.message,
    rateText: rateTextOf(summary),
    coinText: COIN_FLIP_PERCENT,
    intervalText: intervalTextOf(summary),
    verdictMessage: summary.verdictMessage,
  };
}
