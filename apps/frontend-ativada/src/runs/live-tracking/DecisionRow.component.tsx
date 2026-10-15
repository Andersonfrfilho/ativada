// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, useState, type ReactElement } from 'react';

import { formatPrice } from '../../format/format.js';
import type { IconName } from '../../layout/Icon.component.js';
import { formatClosingMoment, formatScoreOfThreshold } from './decision-text.js';
import { DecisionVotes } from './DecisionVotes.component.js';
import type { Decision } from './live-status.validation.js';
import styles from './Decisions.module.css';
import { CHIP_TONE, StatusChip, type ChipTone } from './StatusChip.component.js';

const DAY_WORDS = /^(\d{2}:\d{2}) de (hoje|ontem|amanhã)$/;

type OutcomeLook = { readonly tone: ChipTone; readonly icon: IconName; readonly word: string };

const OUTCOME_LOOK: Readonly<Record<Decision['outcome'], OutcomeLook>> = {
  waited: { tone: CHIP_TONE.NEUTRAL, icon: 'pause', word: 'Esperou' },
  bought: { tone: CHIP_TONE.BUY, icon: 'arrowUp', word: 'Comprou' },
  buy_pending: { tone: CHIP_TONE.NEUTRAL, icon: 'pause', word: 'Pediu compra' },
  sold: { tone: CHIP_TONE.SELL, icon: 'arrowDown', word: 'Vendeu' },
  exited: { tone: CHIP_TONE.SELL, icon: 'arrowDown', word: 'Saiu' },
};

export type DecisionRowProps = {
  readonly decision: Decision;
  readonly rowId?: string;
  readonly now: number;
  readonly timeZone: string;
};

// "10:00" em destaque e "hoje" ao lado; mais longe, a data completa.
function ClosingMoment({ text }: { readonly text: string }): ReactElement {
  const match = DAY_WORDS.exec(text);
  if (match === null) return <strong className={styles.num}>{text}</strong>;
  return (
    <>
      <strong className={styles.num}>{match[1]}</strong>{' '}
      <span className={`${styles.muted} ${styles.extraSmall}`}>{match[2]}</span>
    </>
  );
}

type VotesToggleProps = {
  readonly isOpen: boolean;
  readonly detailId: string;
  readonly onToggle: () => void;
};

function VotesToggle({ isOpen, detailId, onToggle }: VotesToggleProps): ReactElement {
  return (
    <button
      type="button"
      className={styles.expand}
      aria-expanded={isOpen}
      aria-controls={isOpen ? detailId : undefined}
      onClick={onToggle}
    >
      {isOpen ? 'esconder votos' : 'ver votos'}
    </button>
  );
}

// Uma vela decidida (RF05). "Ver votos" abre o detalhe por botão (teclado e aria-expanded).
export function DecisionRow({ decision, rowId, now, timeZone }: DecisionRowProps): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const detailId = useId();
  const look = OUTCOME_LOOK[decision.outcome];
  const closedAt = formatClosingMoment(decision.closedAt, { now, timeZone });
  return (
    <>
      <tr id={rowId}>
        <td>
          <span className={styles.cellLabel}>Fechou</span>
          <ClosingMoment text={closedAt} />
        </td>
        <td className={`${styles.right} ${styles.num}`}>
          <span className={styles.cellLabel}>preço</span>
          {formatPrice(decision.close)}
        </td>
        <td>
          <span className={styles.decisionCell}>
            <StatusChip tone={look.tone} icon={look.icon}>
              {look.word}
            </StatusChip>
            {decision.votes.length === 0 ? null : (
              <VotesToggle
                isOpen={isOpen}
                detailId={detailId}
                onToggle={() => setIsOpen((current) => !current)}
              />
            )}
          </span>
        </td>
        <td className={`${styles.num} ${styles.score}`}>
          <span className={styles.cellLabel}>pontuação</span>
          {formatScoreOfThreshold(decision.score, decision.scoreThreshold)}
        </td>
        <td className={styles.why}>{decision.message}</td>
      </tr>
      {isOpen ? <DecisionVotes decision={decision} closedAtText={closedAt} id={detailId} /> : null}
    </>
  );
}
