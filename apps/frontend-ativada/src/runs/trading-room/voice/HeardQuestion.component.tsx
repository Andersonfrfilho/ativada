// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatSymbol } from '../../../format/format.js';
import controls from '../../../styles/Controls.module.css';
import { ROOM_QUESTIONS } from '../room-questions.constant.js';
import type { RoomQuestions } from '../useRoomQuestions.hook.js';
import { matchSpokenQuestion } from './match-spoken-question.js';
import { TeamVoiceOffers } from './TeamVoiceOffers.component.js';
import {
  heardText,
  unavailableCoinText,
  understoodText,
  VOICE_TEXT,
} from './voice-ask.constant.js';
import styles from './VoiceAsk.module.css';

export type HeardQuestionProps = {
  readonly text: string;
  readonly questions: RoomQuestions;
  readonly onDone: () => void;
};

// O que a pessoa disse, o que foi entendido e a confirmação: nada é perguntado sem o clique em "Perguntar".
export function HeardQuestion({ text, questions, onDone }: HeardQuestionProps): ReactElement {
  const match = matchSpokenQuestion(text, questions.symbols);
  const option = ROOM_QUESTIONS.find((candidate) => candidate.key === match.question);
  const symbol = match.symbol ?? questions.symbol;
  function handleAsk(): void {
    if (option === undefined) return;
    questions.setSymbol(symbol);
    questions.ask(option, symbol);
    onDone();
  }
  if (text === '') return <p className={styles.problem}>{VOICE_TEXT.SILENCE}</p>;
  return (
    <>
      <p className={styles.heard}>{heardText(text)}</p>
      {match.unavailableSymbol === undefined ? null : (
        <p className={styles.heard}>
          {unavailableCoinText(formatSymbol(match.unavailableSymbol), formatSymbol(symbol))}
        </p>
      )}
      {option === undefined ? (
        <p className={styles.problem}>{VOICE_TEXT.NOT_UNDERSTOOD}</p>
      ) : (
        <p className={styles.understood}>{understoodText(option.label, formatSymbol(symbol))}</p>
      )}
      <div className={styles.actions}>
        {option === undefined ? (
          <TeamVoiceOffers text={text} model={questions.team} onDone={onDone} />
        ) : (
          <button type="button" className={controls.button} onClick={handleAsk}>
            {VOICE_TEXT.ASK}
          </button>
        )}
        <button type="button" className={controls.button} onClick={onDone}>
          {VOICE_TEXT.CANCEL}
        </button>
      </div>
    </>
  );
}
