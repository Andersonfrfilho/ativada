// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import type { BalconyAgent } from './balcony-agents.js';
import { BALCONY_TEXT } from './balcony.constant.js';
import styles from './Balcony.module.css';
import type { AuditorView } from '../team-room.types.js';

export type BoardNotesProps = {
  readonly agents: readonly BalconyAgent[];
  readonly auditor: AuditorView | undefined;
};

// As notas do Otávio: quem está fora do placar nesta vela fica riscado, com a frase do auditor logo abaixo.
export function BoardNotes({ agents, auditor }: BoardNotesProps): ReactElement {
  const quiet = agents.filter((agent) => agent.tone === 'quiet');
  return (
    <ul className={styles.boardList}>
      {quiet.map((agent) => (
        <li key={agent.slot}>
          <s>{agent.roleShort}</s> · {BALCONY_TEXT.NOT_VOTING}
        </li>
      ))}
      {quiet.length === 0 ? <li>Todos os especialistas contam no placar nesta vela.</li> : null}
      {auditor === undefined ? null : <li>{auditor.verdictMessage}</li>}
    </ul>
  );
}
