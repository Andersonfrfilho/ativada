// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { KeyboardEvent, ReactElement } from 'react';

import styles from './Runs.module.css';
import tableStyles from './TradesTable.module.css';
import type { ResultTone, TradeRowText } from './trade-row-text.js';

export type TradeRowProps = {
  readonly text: TradeRowText;
  // Posição na tabela inteira (o cabeçalho é a 1); a janela virtual só desenha parte das linhas.
  readonly rowIndex: number;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
};

function toneClass(tone: ResultTone): string {
  if (tone === 'gain') return `${styles.num} ${styles.positive}`;
  return tone === 'loss' ? `${styles.num} ${styles.negative}` : (styles.num ?? '');
}

// Uma operação por linha; Enter, espaço ou clique a selecionam (a seleção é do pai).
export function TradeRow({ text, rowIndex, isSelected, onSelect }: TradeRowProps): ReactElement {
  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect();
  }
  return (
    <tr
      className={`${tableStyles.row} ${isSelected ? tableStyles.selected : ''}`}
      aria-rowindex={rowIndex}
      aria-current={isSelected ? 'true' : undefined}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
    >
      <td>{text.opened}</td>
      <td>{text.closed}</td>
      <td className={styles.num}>{text.entryPrice}</td>
      <td className={styles.num}>{text.exitPrice}</td>
      <td className={styles.num}>{text.quantity}</td>
      <td className={styles.num}>{text.paid}</td>
      <td className={styles.num}>{text.received}</td>
      <td className={styles.num}>{text.fees}</td>
      <td className={toneClass(text.resultTone)}>{text.result}</td>
      <td>{text.reason}</td>
    </tr>
  );
}
