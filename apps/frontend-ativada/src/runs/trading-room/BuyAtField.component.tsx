// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, useState, type FormEvent, type ReactElement } from 'react';

import { TextField } from '../../forms/Fields.component.js';
import controls from '../../styles/Controls.module.css';
import { parseBuyAtPrice } from './buy-at-price.js';
import { ROOM_QUESTIONS_TEXT } from './room-questions.constant.js';
import type { RoomQuestions } from './useRoomQuestions.hook.js';
import styles from './AskTeam.module.css';

// "E se eu comprar a ___?": o preço vai à Alice, que responde com a conta do plano da simulação naquele preço.
export function BuyAtField({ questions }: { readonly questions: RoomQuestions }): ReactElement {
  const id = useId();
  const [value, setValue] = useState('');
  const [isInvalid, setIsInvalid] = useState(false);
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const text = parseBuyAtPrice(value);
    setIsInvalid(text === undefined);
    if (text !== undefined) questions.askBuyAt({ text, shown: value.trim() });
  }
  return (
    <form className={styles.buyAt} onSubmit={handleSubmit}>
      <TextField
        id={id}
        label={ROOM_QUESTIONS_TEXT.BUY_AT_LABEL}
        value={value}
        onChange={setValue}
        hint={ROOM_QUESTIONS_TEXT.BUY_AT_HINT}
      />
      <button type="submit" className={controls.button} disabled={questions.isAsking}>
        {ROOM_QUESTIONS_TEXT.BUY_AT_ASK}
      </button>
      {isInvalid ? (
        <p className={styles.failed} role="alert">
          {ROOM_QUESTIONS_TEXT.BUY_AT_INVALID}
        </p>
      ) : null}
    </form>
  );
}
