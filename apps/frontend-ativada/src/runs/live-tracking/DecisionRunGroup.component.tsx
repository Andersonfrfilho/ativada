// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, useState, type ReactElement } from 'react';

import { formatRelativeMoment } from '../../format/zoned-moment.js';
import { DecisionRow } from './DecisionRow.component.js';
import type { DecisionGroup } from './decision-groups.js';
import styles from './Decisions.module.css';

const UNIT_BY_TIMEFRAME: Readonly<Record<string, string>> = {
  '15m': 'velas de 15 minutos',
  '1h': 'horas',
  '4h': 'velas de 4 horas',
  '1d': 'dias',
};

export type DecisionRunGroupProps = {
  readonly group: DecisionGroup;
  readonly timeframe: string;
  readonly now: number;
  readonly timeZone: string;
};

type RunToggleRowProps = {
  readonly group: DecisionGroup;
  readonly timeframe: string;
  readonly now: number;
  readonly timeZone: string;
  readonly controls: string | undefined;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
};

function RunToggleRow({
  group,
  timeframe,
  now,
  timeZone,
  controls,
  isOpen,
  onToggle,
}: RunToggleRowProps): ReactElement {
  const { head, hidden } = group;
  const unit = UNIT_BY_TIMEFRAME[timeframe] ?? 'velas';
  const oldest = formatRelativeMoment((hidden.at(-1) ?? head).closedAt, { now, timeZone });
  const newest = formatRelativeMoment((hidden[0] ?? head).closedAt, { now, timeZone });
  return (
    <tr className={styles.runRow}>
      <td colSpan={5}>
        <button
          type="button"
          className={styles.expand}
          aria-expanded={isOpen}
          aria-controls={controls}
          onClick={onToggle}
        >
          {isOpen ? 'Esconder' : `Mostrar ${hidden.length} ${unit} iguais`}
        </button>{' '}
        <span className={`${styles.muted} ${styles.small}`}>
          de {oldest} a {newest}: mesma decisão e mesmo motivo da linha acima
        </span>
      </td>
    </tr>
  );
}

// A decisão mais recente e, logo abaixo, um botão que mostra as velas seguidas iguais a ela.
export function DecisionRunGroup(props: DecisionRunGroupProps): ReactElement {
  const { group, now, timeZone } = props;
  const [isOpen, setIsOpen] = useState(false);
  const groupId = useId();
  const rowId = (index: number): string => `${groupId}-${index}`;
  const controls = isOpen
    ? group.hidden.map((_unused, index) => rowId(index)).join(' ')
    : undefined;
  return (
    <>
      <DecisionRow decision={group.head} now={now} timeZone={timeZone} />
      {group.hidden.length === 0 ? null : (
        <RunToggleRow
          group={group}
          timeframe={props.timeframe}
          now={now}
          timeZone={timeZone}
          controls={controls}
          isOpen={isOpen}
          onToggle={() => setIsOpen((current) => !current)}
        />
      )}
      {isOpen
        ? group.hidden.map((decision, index) => (
            <DecisionRow
              key={decision.candleTime}
              rowId={rowId(index)}
              decision={decision}
              now={now}
              timeZone={timeZone}
            />
          ))
        : null}
    </>
  );
}
