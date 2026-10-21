// Copyright (c) 2026 Ada Technology. All rights reserved.
import { HTTP_STATUS } from '@ativada/environment';

import { ApiError } from '../../http/api.error.js';
import type { TeamCardModel } from './useModelTeamsView.hook.js';

export const ON_DEMAND_TEXT = {
  BUTTON: 'Pedir opinião agora',
  WAITING: 'Aguardando a resposta da equipe…',
  MARK: 'pedido avulso · não entra no placar',
  OFF: 'Equipe desligada: ligue nas preferências para pedir uma opinião.',
  NO_ANALYST:
    'O pedido avulso precisa do analista de risco ligado nesta simulação; esta foi criada sem ele.',
  NOT_RUNNING: 'A simulação não está rodando: não há uma última vela para opinar.',
  UNAVAILABLE: 'Indisponível agora:',
  LIMIT: 'Limite de pedidos atingido; tente de novo mais tarde.',
  GENERIC: 'Não foi possível pedir a opinião agora. Tente de novo.',
  FAILED: 'A chamada falhou; a equipe segue sem leitura desta vela. Código:',
  HIDDEN: 'O texto do modelo foi ocultado pela regra de linguagem da casa.',
} as const;

const ERROR_PHRASE: Readonly<Record<string, string>> = {
  ANALYST_NOT_ENABLED: ON_DEMAND_TEXT.NO_ANALYST,
  RUN_NOT_RUNNING: ON_DEMAND_TEXT.NOT_RUNNING,
  MODEL_TEAM_DISABLED: ON_DEMAND_TEXT.OFF,
  MODEL_TEAM_UNAVAILABLE: `${ON_DEMAND_TEXT.UNAVAILABLE} provedor sem resposta ou sem chave.`,
};

export type OnDemandContext = {
  readonly card: TeamCardModel;
  readonly isRunning: boolean | undefined;
  readonly hasAnalyst: boolean | undefined;
  readonly isPending: boolean;
};

// A frase do motivo quando o botão fica desabilitado (RF20); `undefined` = pode pedir. Só afirma o que sabe: os dados que ainda
// não chegaram (`undefined`) não desabilitam, e o servidor responde com o código certo se faltar algo.
export function whyOnDemandBlocked(context: OnDemandContext): string | undefined {
  const { state, badge } = context.card;
  if (state === undefined || badge === undefined) return ON_DEMAND_TEXT.NOT_RUNNING;
  if (!state.team.isEnabled) return ON_DEMAND_TEXT.OFF;
  if (context.hasAnalyst === false) return ON_DEMAND_TEXT.NO_ANALYST;
  if (context.isRunning === false) return ON_DEMAND_TEXT.NOT_RUNNING;
  if (!state.team.providerStatus.isAvailable) return `${ON_DEMAND_TEXT.UNAVAILABLE} ${badge.word}.`;
  return context.isPending ? ON_DEMAND_TEXT.WAITING : undefined;
}

export function describeOpinionError(error: unknown): string {
  if (!(error instanceof ApiError)) return ON_DEMAND_TEXT.GENERIC;
  if (error.status === HTTP_STATUS.TOO_MANY_REQUESTS) return ON_DEMAND_TEXT.LIMIT;
  return ERROR_PHRASE[error.code] ?? ON_DEMAND_TEXT.GENERIC;
}
