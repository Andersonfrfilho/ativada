// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import styles from './HistoryNote.module.css';

export type HistoryNoteProps = { readonly extra?: string };

// Todo número calculado sobre candles que já aconteceram leva este aviso: resultado histórico não é promessa.
export function HistoryNote({ extra }: HistoryNoteProps): ReactElement {
  return (
    <div role="note" aria-label="Leia com cuidado" className={styles.notice}>
      Isto é o histórico: o que teria acontecido com candles que já aconteceram. O passado não
      promete o futuro, e nada aqui é recomendação de investimento.
      {extra === undefined ? null : ` ${extra}`}
    </div>
  );
}
