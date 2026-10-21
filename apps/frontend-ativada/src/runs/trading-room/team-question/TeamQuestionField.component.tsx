// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement } from 'react';

import controls from '../../../styles/Controls.module.css';
import { hasPersonalData } from './personal-data.js';
import {
  askButtonText,
  counterText,
  fieldLabel,
  noticeText,
  TEAM_QUESTION_MAX_LENGTH,
  TEAM_QUESTION_MIN_LENGTH,
  TEAM_QUESTION_TEXT,
  thinkingText,
} from './team-question.constant.js';
import type { QuestionTeam, TeamQuestionsModel } from './useTeamQuestions.hook.js';
import styles from './TeamQuestion.module.css';

export type TeamQuestionFieldProps = {
  readonly team: QuestionTeam;
  readonly model: TeamQuestionsModel;
  readonly symbol: string;
};

function StatusLine({ team, model }: Omit<TeamQuestionFieldProps, 'symbol'>): ReactElement | null {
  const error = model.errorOf(team.key);
  if (error !== undefined) return <p className={styles.failed}>{error}</p>;
  const state = model.stateOf(team.key);
  if (state?.kind === 'pending') return <p className={styles.note}>{thinkingText(team.name)}</p>;
  if (state?.kind === 'failed') return <p className={styles.failed}>{state.text}</p>;
  return null;
}

type FieldHintsProps = {
  readonly team: QuestionTeam;
  readonly draft: string;
  readonly ids: { readonly noticeId: string; readonly counterId: string };
};

// O contador, o aviso fixo de para onde vai o texto e o alerta de dado pessoal (antes de enviar).
function FieldHints({ team, draft, ids }: FieldHintsProps): ReactElement {
  return (
    <>
      <p id={ids.counterId} className={styles.note}>
        {counterText(draft.length)}
      </p>
      <p id={ids.noticeId} className={styles.note}>
        {noticeText({ name: team.name, company: team.company })}
      </p>
      {hasPersonalData(draft) ? (
        <p className={styles.failed}>{TEAM_QUESTION_TEXT.PERSONAL_DATA}</p>
      ) : null}
    </>
  );
}

// "Pergunte à Olívia ◆": o texto livre vai ao provedor da equipe (com o aviso fixo); a resposta entra em "Perguntas".
export function TeamQuestionField({ team, model, symbol }: TeamQuestionFieldProps): ReactElement {
  const fieldId = useId();
  const noticeId = useId();
  const counterId = useId();
  const draft = model.draftOf(team.key);
  const isPersonal = hasPersonalData(draft);
  const isShort = draft.trim().length < TEAM_QUESTION_MIN_LENGTH;
  const isBusy = model.isSending(team.key) || model.stateOf(team.key)?.kind === 'pending';
  return (
    <div className={styles.field}>
      <label htmlFor={fieldId} className={styles.label}>
        {fieldLabel(team.name)}
      </label>
      <textarea
        id={fieldId}
        className={styles.text}
        rows={3}
        maxLength={TEAM_QUESTION_MAX_LENGTH}
        value={draft}
        aria-describedby={`${noticeId} ${counterId}`}
        onChange={(event) => model.setDraft(team.key, event.target.value)}
      />
      <FieldHints team={team} draft={draft} ids={{ noticeId, counterId }} />
      <button
        type="button"
        className={controls.button}
        disabled={isPersonal || isShort || isBusy}
        onClick={() => model.ask(team.key, symbol)}
      >
        {askButtonText(team.name)}
      </button>
      <StatusLine team={team} model={model} />
    </div>
  );
}

// Um campo por equipe ◆ LIGADA; sem nenhuma, nada (a desligada nunca aparece).
export function TeamQuestionFields({
  model,
  symbol,
}: Omit<TeamQuestionFieldProps, 'team'>): ReactElement {
  return (
    <>
      {model.teams.map((team) => (
        <TeamQuestionField key={team.key} team={team} model={model} symbol={symbol} />
      ))}
    </>
  );
}
