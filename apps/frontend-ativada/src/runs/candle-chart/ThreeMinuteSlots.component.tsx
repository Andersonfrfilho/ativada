// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatPrice } from '../../format/format.js';
import { formatTimeInZone } from '../../format/zoned-time.js';
import { Icon, type IconName } from '../../layout/Icon.component.js';
import type { DisplaySlot, SlotDirection } from './display-slots.js';
import styles from './NextCandlePanel.module.css';

export type ThreeMinuteSlotsProps = {
  readonly slots: readonly DisplaySlot[];
  readonly timeZone: string;
};

const DIRECTION_ICON: Readonly<Record<SlotDirection, IconName>> = {
  up: 'arrowUp',
  down: 'arrowDown',
  flat: 'equal',
};

const DIRECTION_WORD: Readonly<Record<SlotDirection, string>> = {
  up: 'alta',
  down: 'queda',
  flat: 'igual',
};

function stateWord(slot: DisplaySlot): string {
  if (slot.state === 'forming') return 'em formação';
  if (slot.state === 'arriving') return 'chegando';
  if (slot.state === 'missing') return 'sem dado';
  if (slot.state === 'pending') return 'falta';
  return slot.hasNoTrades ? 'sem negócio' : 'fechada';
}

function Slot({
  slot,
  timeZone,
}: {
  readonly slot: DisplaySlot;
  readonly timeZone: string;
}): ReactElement {
  const { direction } = slot;
  return (
    <li className={`${styles.slot} ${styles[`slot_${slot.state}`] ?? ''}`}>
      <span className={styles.slotTime}>{formatTimeInZone(slot.openTime, timeZone)}</span>
      <span className={styles.slotState}>
        {direction === undefined ? null : <Icon name={DIRECTION_ICON[direction]} size={14} />}
        {stateWord(slot)}
        {direction === undefined ? null : ` · ${DIRECTION_WORD[direction]}`}
      </span>
      <span className={styles.number}>
        {slot.close === undefined ? '—' : formatPrice(slot.close)}
      </span>
    </li>
  );
}

// As 5 velas de 3 min que compõem a vela de 15 min em formação: estado em ícone + palavra, nunca só cor.
export function ThreeMinuteSlots({ slots, timeZone }: ThreeMinuteSlotsProps): ReactElement {
  return (
    <section className={styles.slots} aria-label="As velas de 3 min desta vela de 15 min">
      <h4 className={styles.slotsTitle}>As velas de 3 min desta vela de 15 min</h4>
      <ol className={styles.slotList}>
        {slots.map((slot) => (
          <Slot key={slot.openTime} slot={slot} timeZone={timeZone} />
        ))}
      </ol>
    </section>
  );
}
