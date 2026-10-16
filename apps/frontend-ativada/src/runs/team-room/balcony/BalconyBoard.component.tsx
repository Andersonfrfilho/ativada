// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, useState, type KeyboardEvent, type ReactElement } from 'react';

import type { AuditorView } from '../team-room.types.js';
import type { BalconyAgent } from './balcony-agents.js';
import { BALCONY_TEXT } from './balcony.constant.js';
import styles from './Balcony.module.css';
import { BoardNotes } from './BoardNotes.component.js';
import { BoardRankingSummary } from './BoardRankingSummary.component.js';

export type BoardTab = 'ranking' | 'notes';

const TAB_LABEL: Readonly<Record<BoardTab, string>> = { ranking: 'Ranking', notes: 'Notas' };
const TABS: readonly BoardTab[] = ['ranking', 'notes'];

export type BalconyBoardProps = {
  readonly agents: readonly BalconyAgent[];
  readonly auditor: AuditorView | undefined;
};

function nextTab(current: BoardTab, key: string): BoardTab {
  const index = TABS.indexOf(current);
  if (key === 'ArrowRight') return TABS[(index + 1) % TABS.length] ?? current;
  if (key === 'ArrowLeft') return TABS[(index + TABS.length - 1) % TABS.length] ?? current;
  return current;
}

type TabsProps = { readonly tab: BoardTab; readonly onChange: (tab: BoardTab) => void };

function BoardTabs({ tab, onChange }: TabsProps): ReactElement {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    onChange(nextTab(tab, event.key));
  }
  return (
    <div role="tablist" className={styles.tabs} onKeyDown={handleKeyDown}>
      {TABS.map((name) => (
        <button
          key={name}
          type="button"
          role="tab"
          aria-selected={tab === name}
          tabIndex={tab === name ? 0 : -1}
          className={styles.tab}
          onClick={() => onChange(name)}
        >
          {TAB_LABEL[name]}
        </button>
      ))}
    </div>
  );
}

// A lousa: o que é longo demais para o balão. No celular vira uma folha que abre pelo botão do rodapé da varanda.
export function BalconyBoard({ agents, auditor }: BalconyBoardProps): ReactElement {
  const [tab, setTab] = useState<BoardTab>('ranking');
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const panelId = useId();
  return (
    <section className={styles.board} data-open={isSheetOpen} aria-label={BALCONY_TEXT.BOARD_TITLE}>
      <button
        type="button"
        className={styles.sheetToggle}
        aria-expanded={isSheetOpen}
        aria-controls={panelId}
        onClick={() => setIsSheetOpen((previous) => !previous)}
      >
        {BALCONY_TEXT.SHEET_TOGGLE}
      </button>
      <div id={panelId} className={styles.boardBody}>
        <h4 className={styles.boardTitle}>{BALCONY_TEXT.BOARD_TITLE}</h4>
        <BoardTabs tab={tab} onChange={setTab} />
        <div role="tabpanel" className={styles.boardPanel}>
          {tab === 'ranking' ? (
            <BoardRankingSummary auditor={auditor} />
          ) : (
            <BoardNotes agents={agents} auditor={auditor} />
          )}
        </div>
      </div>
    </section>
  );
}
