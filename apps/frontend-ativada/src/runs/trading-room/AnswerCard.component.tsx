// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import styles from './Opinion.module.css';

export type AnswerCardProps = {
  readonly name: string;
  readonly question: string;
  readonly text: string;
};

// A resposta de quem foi ao telão: a pergunta e a frase do servidor, como texto (nunca HTML).
export function AnswerCard({ name, question, text }: AnswerCardProps): ReactElement {
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <span className={styles.who}>
          <strong>{name}</strong>
          <small>{question}</small>
        </span>
      </div>
      <p className={styles.answer}>{text}</p>
    </div>
  );
}
