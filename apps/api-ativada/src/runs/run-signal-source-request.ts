// Copyright (c) 2026 Ada Technology. All rights reserved.
import { RUN_KIND, type RunKind } from '@ativada/database';
import type { SignalSource } from '@ativada/model-agents';

import { addIssue, type RefinementContext } from './create-run-setup.js';
import { RUN_FIELD, RUN_REASON } from './runs.constant.js';

const SIGNAL_SOURCE_TIMEFRAME = '15m';

type SignalSourceBody = {
  readonly kind: RunKind;
  readonly timeframe: string;
  readonly strategyVersionId?: string | undefined;
  readonly signalSource?: SignalSource | undefined;
  readonly goalId?: string | undefined;
  readonly analyst?: unknown;
};

// A execução de equipe (spec 015, plan D9): só ao vivo e em vela de 15 min; a versão da estratégia é a fixa do sistema (então o
// corpo não a traz); meta e analista são proibidos (o analista governa por regra e a meta fecha por desfecho de carteira, e a
// equipe não passa por nenhum dos dois). Sem `signalSource`, a versão da estratégia é obrigatória como sempre foi.
export function checkSignalSource(body: SignalSourceBody, context: RefinementContext): void {
  if (body.signalSource === undefined) {
    if (body.strategyVersionId === undefined) {
      addIssue(context, [RUN_FIELD.STRATEGY_VERSION_ID], RUN_REASON.REQUIRED);
    }
    return;
  }
  if (body.kind !== RUN_KIND.LIVE_PAPER) {
    addIssue(context, [RUN_FIELD.SIGNAL_SOURCE], RUN_REASON.NOT_ALLOWED_FOR_KIND);
  }
  if (body.timeframe !== SIGNAL_SOURCE_TIMEFRAME) {
    addIssue(context, [RUN_FIELD.SIGNAL_SOURCE], RUN_REASON.SIGNAL_SOURCE_REQUIRES_15M);
  }
  const forbidden = [
    [RUN_FIELD.STRATEGY_VERSION_ID, body.strategyVersionId],
    [RUN_FIELD.GOAL_ID, body.goalId],
    [RUN_FIELD.ANALYST, body.analyst],
  ] as const;
  for (const [field, value] of forbidden) {
    if (value !== undefined) addIssue(context, [field], RUN_REASON.NOT_ALLOWED_WITH_SIGNAL_SOURCE);
  }
}
