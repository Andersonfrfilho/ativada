// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState } from 'react';

import { HTTP_STATUS } from '@ativada/environment';

import { ApiError } from '../../../http/api.error.js';
import type { ModelTeamKey } from '../../model-teams/model-teams.constant.js';
import { useModelTeamsView } from '../../model-teams/useModelTeamsView.hook.js';
import type { QuestionEntry } from '../question-entry.js';
import {
  describeQuestionFailure,
  TEAM_PROVIDER_COMPANY,
  TEAM_QUESTION_TEXT,
} from './team-question.constant.js';
import { useAskTeamQuestionMutation, useTeamQuestionsQuery } from './team-question.query.js';
import type { TeamQuestion } from './team-question.validation.js';

export type QuestionTeam = {
  readonly key: ModelTeamKey;
  readonly name: string;
  readonly company: string;
};

// O estado da última pergunta desta tela a uma equipe: pensando ou a falha em palavras (a resposta vai ao histórico).
export type TeamQuestionState =
  { readonly kind: 'pending' } | { readonly kind: 'failed'; readonly text: string };

export type TeamQuestionsModel = {
  // Só as equipes LIGADAS (`useModelTeamsView` já filtra): a desligada não aparece.
  readonly teams: readonly QuestionTeam[];
  readonly draftOf: (teamKey: ModelTeamKey) => string;
  readonly setDraft: (teamKey: ModelTeamKey, text: string) => void;
  readonly ask: (teamKey: ModelTeamKey, symbol: string) => void;
  readonly isSending: (teamKey: ModelTeamKey) => boolean;
  readonly errorOf: (teamKey: ModelTeamKey) => string | undefined;
  readonly stateOf: (teamKey: ModelTeamKey) => TeamQuestionState | undefined;
  // As respondidas (e as ocultas, com a frase fixa), com `isTracked` = pedidas nesta tela.
  readonly entries: readonly (QuestionEntry & { readonly isTracked: boolean })[];
};

const ERROR_WORDS: Readonly<Record<string, string>> = {
  MODEL_QUESTION_LIMIT_REACHED: TEAM_QUESTION_TEXT.LIMIT,
  RATE_LIMITED: TEAM_QUESTION_TEXT.LIMIT,
  MODEL_TEAM_DISABLED: TEAM_QUESTION_TEXT.DISABLED,
  MODEL_TEAM_UNAVAILABLE: TEAM_QUESTION_TEXT.UNAVAILABLE,
};

function describeSendError(error: Error): string {
  if (!(error instanceof ApiError)) return TEAM_QUESTION_TEXT.GENERIC;
  if (error.status === HTTP_STATUS.BAD_REQUEST) return TEAM_QUESTION_TEXT.INVALID;
  if (error.status === HTTP_STATUS.TOO_MANY_REQUESTS) return TEAM_QUESTION_TEXT.LIMIT;
  return ERROR_WORDS[error.code] ?? TEAM_QUESTION_TEXT.GENERIC;
}

function toEntry(
  item: TeamQuestion,
  params: { readonly name: string; readonly tracked: ReadonlySet<string> },
): readonly (QuestionEntry & { readonly isTracked: boolean })[] {
  if ((item.status !== 'answered' && item.status !== 'hidden') || item.decidedAt === null)
    return [];
  return [
    {
      key: item.decidedAt,
      who: item.teamKey,
      name: params.name,
      question: item.question,
      text: item.answer ?? '',
      symbol: item.symbol,
      isIndicative: false,
      isTracked: params.tracked.has(item.id),
    },
  ];
}

function stateOfItem(item: TeamQuestion | undefined): TeamQuestionState | undefined {
  if (item?.status === 'pending') return { kind: 'pending' };
  if (item?.status === 'failed')
    return { kind: 'failed', text: describeQuestionFailure(item.failureCode) };
  return undefined;
}

// O rascunho de cada equipe: a fala transcrita também cai aqui (a pessoa ainda revisa e confirma).
function useDrafts(): Pick<TeamQuestionsModel, 'draftOf' | 'setDraft'> {
  const [drafts, setDrafts] = useState<Readonly<Partial<Record<ModelTeamKey, string>>>>({});
  return {
    draftOf: (teamKey) => drafts[teamKey] ?? '',
    setDraft: (teamKey, text) => setDrafts((before) => ({ ...before, [teamKey]: text })),
  };
}

// A pergunta livre às equipes ◆ ligadas (adendo da spec 015): o rascunho de cada uma, o envio e a lista do servidor.
export function useTeamQuestions(runId: string): TeamQuestionsModel {
  const cards = useModelTeamsView().teams;
  const teams = cards.map((card) => ({
    key: card.key,
    name: card.name,
    company: TEAM_PROVIDER_COMPANY[card.key],
  }));
  const { draftOf, setDraft } = useDrafts();
  const [tracked, setTracked] = useState<ReadonlySet<string>>(new Set());
  const list = useTeamQuestionsQuery(runId, teams.length > 0).data?.items ?? [];
  const mutation = useAskTeamQuestionMutation(runId);
  const nameOf = (key: ModelTeamKey): string => teams.find((team) => team.key === key)?.name ?? key;
  const latestTracked = (key: ModelTeamKey): TeamQuestion | undefined =>
    list.find((item) => item.teamKey === key && tracked.has(item.id));
  function ask(teamKey: ModelTeamKey, symbol: string): void {
    const question = draftOf(teamKey).trim();
    mutation.mutate(
      { teamKey, symbol, question },
      {
        onSuccess: (questionId) => {
          setTracked((before) => new Set([...before, questionId]));
          setDraft(teamKey, '');
        },
      },
    );
  }
  const sentTeam = mutation.variables?.teamKey;
  return {
    teams,
    draftOf,
    setDraft,
    ask,
    isSending: (teamKey) => mutation.isPending && sentTeam === teamKey,
    errorOf: (teamKey) =>
      mutation.isError && sentTeam === teamKey ? describeSendError(mutation.error) : undefined,
    stateOf: (teamKey) => stateOfItem(latestTracked(teamKey)),
    entries: list.flatMap((item) => toEntry(item, { name: nameOf(item.teamKey), tracked })),
  };
}
