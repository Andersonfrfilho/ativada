// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement } from 'react';

import { formatSymbol } from '../../format/format.js';
import { SelectField } from '../../forms/Fields.component.js';
import controls from '../../styles/Controls.module.css';
import { ROOM_QUESTIONS, ROOM_QUESTIONS_TEXT } from './room-questions.constant.js';
import { TeamQuestionFields } from './team-question/TeamQuestionField.component.js';
import type { RoomQuestions } from './useRoomQuestions.hook.js';
import { VoiceAsk } from './voice/VoiceAsk.component.js';
import styles from './AskTeam.module.css';

export type AskTeamProps = { readonly questions: RoomQuestions };

function QuickQuestionButtons({ questions }: AskTeamProps): ReactElement {
  return (
    <div className={styles.buttons}>
      {ROOM_QUESTIONS.map((option) => (
        <button
          key={option.key}
          type="button"
          className={controls.button}
          disabled={questions.isAsking}
          onClick={() => questions.ask(option)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// A caixa "Pergunte à equipe": a moeda e as perguntas rápidas. Quem responde vai ao telão; a resposta também fica em texto.
export function AskTeam({ questions }: AskTeamProps): ReactElement {
  const titleId = useId();
  const symbolId = useId();
  return (
    <section className={styles.box} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.title}>
        {ROOM_QUESTIONS_TEXT.TITLE}
      </h3>
      <p className={styles.note}>{ROOM_QUESTIONS_TEXT.NOTE}</p>
      <div className={styles.symbol}>
        <SelectField
          id={symbolId}
          label={ROOM_QUESTIONS_TEXT.SYMBOL}
          value={questions.symbol}
          options={questions.symbols.map((symbol) => ({
            value: symbol,
            label: formatSymbol(symbol),
          }))}
          onChange={questions.setSymbol}
        />
      </div>
      <VoiceAsk questions={questions} />
      <QuickQuestionButtons questions={questions} />
      {questions.isAsking ? <p className={styles.note}>{ROOM_QUESTIONS_TEXT.ASKING}</p> : null}
      {questions.hasFailed ? <p className={styles.failed}>{ROOM_QUESTIONS_TEXT.FAILED}</p> : null}
      <TeamQuestionFields model={questions.team} symbol={questions.symbol} />
    </section>
  );
}
