// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_STATUS, type DecisionRow } from '@ativada/database';
import {
  ruleLabel,
  TRIGGER_STATE,
  type NextTriggers,
  type TriggerState,
} from '@ativada/strategy-engine';

import type { LiveRunContext } from './live-status-context.js';
import type { RuleTriggerView, TriggersView } from './live-status-view.js';
import {
  TRIGGER_UNAVAILABLE_REASON,
  type TriggerUnavailableReason,
} from './live-status.constant.js';
import {
  buildTriggerRuleMessage,
  buildTriggersMessage,
  buildTriggersUnavailableMessage,
} from './trigger-messages.js';
import { completesScore } from './rule-completes-score.js';
import { computeStoredTriggers, STORED_READINGS_STATUS } from './stored-readings.js';

export type LiveTriggersParams = {
  readonly context: LiveRunContext;
  // As duas decisões mais recentes (a última e a anterior), da mais nova para a mais antiga.
  readonly rows: readonly DecisionRow[];
  readonly hasOpenPosition: boolean;
};

function unavailable(
  context: LiveRunContext,
  reason: TriggerUnavailableReason,
): Extract<TriggersView, { status: 'unavailable' }> {
  return {
    status: 'unavailable',
    reason,
    message: buildTriggersUnavailableMessage({ reason, runStatus: context.run.status }),
  };
}

function toRuleViews(context: LiveRunContext, triggers: NextTriggers): readonly RuleTriggerView[] {
  return triggers.rules.flatMap((trigger) => {
    const rule = context.config.rules.find((candidate) => candidate.id === trigger.ruleId);
    if (rule === undefined) return [];
    const label = ruleLabel(rule);
    return [
      {
        ruleId: trigger.ruleId,
        label,
        kind: trigger.kind,
        vote: trigger.vote,
        weight: trigger.weight,
        isMet: trigger.isMet,
        metric: trigger.metric,
        direction: trigger.direction,
        basis: trigger.basis,
        current: trigger.current,
        threshold: trigger.threshold,
        distance: trigger.distance,
        distanceRate: trigger.distanceRate,
        message: buildTriggerRuleMessage({ rule: trigger, label, state: triggers.state }),
        completesScore: completesScore({
          state: triggers.state,
          scoreGap: triggers.scoreGap,
          rule: trigger,
        }),
      },
    ];
  });
}

// O que falta para comprar (ou vender, se comprada) AGORA, das leituras gravadas das duas últimas velas, sem reexecutar o
// motor (ADR 0002, L1 a L3). A precedência do "porquê não há gatilho" é: não está rodando, sem vela, aquecendo.
export function buildTriggersSection(params: LiveTriggersParams): TriggersView {
  const { context, rows } = params;
  if (context.run.status !== RUN_STATUS.RUNNING) {
    return unavailable(context, TRIGGER_UNAVAILABLE_REASON.NOT_RUNNING);
  }
  const [latest, previous] = rows;
  if (latest === undefined) return unavailable(context, TRIGGER_UNAVAILABLE_REASON.NO_CANDLE);
  const state: TriggerState = params.hasOpenPosition
    ? TRIGGER_STATE.HOLDING
    : TRIGGER_STATE.AWAITING_ENTRY;
  const stored = computeStoredTriggers({
    config: context.config,
    latest: { indicators: latest.indicators, sentimentObservation: latest.sentimentObservation },
    previous:
      previous === undefined
        ? undefined
        : { indicators: previous.indicators, sentimentObservation: previous.sentimentObservation },
    market: {
      close: latest.close,
      closeTime: latest.closeTime,
      sentimentSource: context.parameters.sentimentSource,
    },
    state,
  });
  if (stored.status === STORED_READINGS_STATUS.NEEDS_PREVIOUS) {
    return unavailable(context, TRIGGER_UNAVAILABLE_REASON.WARMING_UP);
  }
  const { triggers } = stored;
  return {
    status: 'available',
    state: triggers.state,
    score: triggers.score,
    scoreThreshold: triggers.scoreThreshold,
    scoreGap: triggers.scoreGap,
    message: buildTriggersMessage(triggers),
    rules: toRuleViews(context, triggers),
  };
}
