// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement } from 'react';

import { formatSymbol } from '../../format/format.js';
import { ROOM_QUESTIONS_TEXT } from './room-questions.constant.js';
import type { QuestionEntry } from './useRoomQuestions.hook.js';
import styles from './AskTeam.module.css';

// "Perguntas": as últimas respostas em texto, a alternativa ao balão do piso (que é decorativo).
export function QuestionHistory({
  entries,
}: {
  readonly entries: readonly QuestionEntry[];
}): ReactElement {
  const titleId = useId();
  return (
    <section className={styles.history} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.title}>
        {ROOM_QUESTIONS_TEXT.HISTORY}
      </h3>
      {entries.length === 0 ? (
        <p className={styles.note}>{ROOM_QUESTIONS_TEXT.EMPTY}</p>
      ) : (
        <ol className={styles.entries}>
          {entries.map((entry) => (
            <li key={entry.key} className={styles.entry}>
              <p className={styles.asked}>
                <strong>{entry.name}</strong> · {formatSymbol(entry.symbol)} · {entry.question}
              </p>
              <p className={styles.reply}>{entry.text}</p>
              {entry.isIndicative ? (
                <p className={styles.note}>{ROOM_QUESTIONS_TEXT.INDICATIVE}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
