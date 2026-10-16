// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useAnalystDecisionsQuery, useAnalystQuery } from '../analyst/analyst.query.js';
import type { AnalystDecision } from '../analyst/analyst.validation.js';
import {
  buildMissingRiskAnalyst,
  buildRiskAnalystView,
  buildUnavailableRiskAnalyst,
} from './team-room-analyst.js';
import type { RiskAnalystView } from './team-room.types.js';

export type RiskAnalystSource = {
  // `false` enquanto a consulta carrega, quando falha e quando a simulação não tem analista: a sala mantém o resumo do placar.
  readonly isEnabled: boolean;
  // O que o analista disse na vela de `candleTime`; a mais recente usa a decisão de agora (que pode estar indisponível).
  readonly viewFor: (candleTime: number, isLatest: boolean) => RiskAnalystView | undefined;
};

const DISABLED: RiskAnalystSource = { isEnabled: false, viewFor: () => undefined };

// O analista real na sala e na equipe compacta (spec 007, T3.3): as mesmas consultas do cartão, sob a raiz `runs`.
export function useRiskAnalystSource(runId: string): RiskAnalystSource {
  const snapshot = useAnalystQuery(runId).data;
  const isEnabled = snapshot?.isEnabled === true;
  const pages = useAnalystDecisionsQuery(runId, isEnabled).data?.pages;
  if (snapshot === undefined || !snapshot.isEnabled) return DISABLED;
  const { analyst } = snapshot;
  const decisions: readonly AnalystDecision[] = pages?.flatMap((page) => page.items) ?? [];
  const isShadow = analyst.mode === 'shadow';
  return {
    isEnabled,
    viewFor: (candleTime, isLatest): RiskAnalystView | undefined => {
      if (isLatest) {
        const unavailable = buildUnavailableRiskAnalyst(analyst);
        if (unavailable !== undefined) return unavailable;
      }
      const found = decisions.find((decision) => decision.candleTime === candleTime);
      if (found !== undefined) return buildRiskAnalystView(found);
      const current = analyst.current;
      if (current.status === 'decided' && current.candleTime === candleTime) {
        return buildRiskAnalystView(current);
      }
      return buildMissingRiskAnalyst(isShadow);
    },
  };
}
