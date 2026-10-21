// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { GoalRunOutcome, RunStatus } from '@ativada/database';
import type { RuleKind, RuleTrigger, SignalAction, TriggerState } from '@ativada/strategy-engine';

import type { WaitingForDataView } from '../run-view.js';
import type { BuyAndHold, LiveBalance } from './live-balance.js';
import type { LiveGoalProgress } from './live-goal-progress.js';
import type { DecisionOutcome, TriggerUnavailableReason } from './live-status.constant.js';

// O voto de uma regra naquela vela, com o nome simples e a leitura gravada do indicador (texto por saída).
export type DecisionVoteView = {
  readonly ruleId: string;
  readonly label: string;
  readonly kind: RuleKind;
  readonly vote: -1 | 0 | 1;
  readonly weight: string;
  readonly isMissing: boolean;
  readonly reading: Readonly<Record<string, string>> | null;
};

export type DecisionView = {
  readonly candleTime: number;
  // O FECHAMENTO da vela (`candleTime` + duração): é quando a estratégia decide.
  readonly closedAt: number;
  readonly close: string;
  readonly action: SignalAction;
  readonly outcome: DecisionOutcome;
  readonly score: string;
  readonly scoreThreshold: string;
  readonly regime: string;
  readonly message: string;
  readonly technicalReason: string;
  readonly votes: readonly DecisionVoteView[];
};

export type DecisionsPageView = {
  readonly items: readonly DecisionView[];
  readonly nextCursor: string | null;
};

export type LiveRunSectionView = {
  readonly id: string;
  readonly status: RunStatus;
  readonly symbol: string;
  readonly timeframe: string;
  readonly periodStart: number;
  readonly lastCandleTime: number | null;
  readonly lastDecisionAt: number | null;
  readonly nextDecisionAt: number | null;
  readonly waitingForData: WaitingForDataView | null;
  readonly stalledSince?: number;
};

export type BalanceSectionView = LiveBalance & {
  readonly observedAt: number | null;
  readonly message: string;
};

export type BuyAndHoldSectionView = BuyAndHold & { readonly message: string };

export type GoalSectionView = LiveGoalProgress & {
  readonly outcome: GoalRunOutcome | null;
  readonly outcomeAt: number | null;
  readonly message: string;
};

export type OpenPositionView = {
  readonly entryPrice: string;
  readonly quantity: string;
  readonly targetPrice: string;
  readonly stopPrice: string;
  readonly openedCandleTime: number;
};

export type RuleTriggerView = Omit<RuleTrigger, 'family'> & {
  readonly label: string;
  readonly message: string;
  // Aditivo (spec 014): esta regra sozinha completa o placar (peso a favor >= o que falta).
  readonly completesScore: boolean;
};

export type TriggersView =
  | {
      readonly status: 'available';
      readonly state: TriggerState;
      readonly score: string;
      readonly scoreThreshold: string;
      readonly scoreGap: string;
      readonly message: string;
      readonly rules: readonly RuleTriggerView[];
    }
  | {
      readonly status: 'unavailable';
      readonly reason: TriggerUnavailableReason;
      readonly message: string;
    };

export type LiveStatusView = {
  readonly run: LiveRunSectionView;
  readonly balance: BalanceSectionView;
  readonly buyAndHold: BuyAndHoldSectionView | null;
  readonly goal: GoalSectionView | null;
  readonly openPosition: OpenPositionView | null;
  readonly triggers: TriggersView;
  readonly decisions: DecisionsPageView;
};
