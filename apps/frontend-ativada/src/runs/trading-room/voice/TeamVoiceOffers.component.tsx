// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import controls from '../../../styles/Controls.module.css';
import {
  TEAM_QUESTION_MAX_LENGTH,
  voiceOfferText,
} from '../team-question/team-question.constant.js';
import type { TeamQuestionsModel } from '../team-question/useTeamQuestions.hook.js';

export type TeamVoiceOffersProps = {
  readonly text: string;
  readonly model: TeamQuestionsModel;
  readonly onDone: () => void;
};

// A fala que não casa com uma pergunta rápida pode virar pergunta livre: o texto vai para o campo da equipe ◆ ligada, e a
// pessoa ainda revisa e confirma em "Perguntar à …" (nada sai daqui direto).
export function TeamVoiceOffers({ text, model, onDone }: TeamVoiceOffersProps): ReactElement {
  const question = text.trim().slice(0, TEAM_QUESTION_MAX_LENGTH);
  return (
    <>
      {model.teams.map((team) => (
        <button
          key={team.key}
          type="button"
          className={controls.button}
          onClick={() => {
            model.setDraft(team.key, question);
            onDone();
          }}
        >
          {voiceOfferText({ name: team.name, text: question })}
        </button>
      ))}
    </>
  );
}
