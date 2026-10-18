// Copyright (c) 2026 Ada Technology. All rights reserved.
import { HTTP_STATUS } from '@ativada/environment';

import { ApiError } from '../../http/api.error.js';
import { MODEL_TEAM_VISUAL } from '../model-teams/model-teams.constant.js';
import type { DuelRun } from './duel.validation.js';

export const DUEL_TEXT = {
  TITLE: 'Duelo: equipes × regras',
  SUBTITLE: 'Mesmo par, mesma vela e mesmo saldo fictício. Período curto não prova nada.',
  ACCURACY_NOTICE:
    'Comparação de acerto do lado da próxima vela; não mede lucro e não é recomendação.',
  RETURN_NOTICE: 'Retorno e perda máxima: resultado de uma simulação curta, não prova de nada.',
  CHART_TITLE: 'Patrimônio de cada execução',
  RANKING_TITLE: 'Ranking',
  LOADING: 'Carregando o duelo…',
  ERROR: 'Não foi possível carregar o duelo. Tente novamente.',
  NOT_FOUND: 'Duelo não encontrado.',
  NO_POINTS: 'O gráfico aparece quando as execuções fecharem a primeira vela.',
  RULES_NAME: 'Minha estratégia (regras)',
  RULES_MARK: '●',
  TEAM_MARK: '◆',
  NO_API_COST: 'sem custo de API',
} as const;

// "◆ Nina (Gemini)" para uma execução de equipe e "● Minha estratégia (regras)" para a de regras: o marcador vai junto do nome.
export function runLabel(run: Pick<DuelRun, 'team'>): string {
  if (run.team === null) return `${DUEL_TEXT.RULES_MARK} ${DUEL_TEXT.RULES_NAME}`;
  const visual = MODEL_TEAM_VISUAL[run.team];
  return `${DUEL_TEXT.TEAM_MARK} ${visual.name} (${visual.provider})`;
}

const CREATE_ERROR: Readonly<Record<string, string>> = {
  LIVE_RUN_LIMIT_REACHED:
    'Não há vagas de simulação ao vivo para todas as execuções do duelo; nada foi criado. Encerre uma simulação ou escolha menos equipes.',
  MODEL_TEAM_DISABLED: 'Uma das equipes está desligada: ligue nas preferências.',
  MODEL_TEAM_UNAVAILABLE: 'Uma das equipes está indisponível agora.',
};

export function describeCreateError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Não foi possível criar o duelo. Tente de novo.';
  if (error.status === HTTP_STATUS.TOO_MANY_REQUESTS) {
    return 'Muitos duelos criados em pouco tempo; tente de novo mais tarde.';
  }
  if (error.status === HTTP_STATUS.BAD_REQUEST) {
    return 'Confira o par, o saldo e as equipes escolhidas.';
  }
  return CREATE_ERROR[error.code] ?? 'Não foi possível criar o duelo. Tente de novo.';
}
