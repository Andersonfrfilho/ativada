// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';

import { LIVE_TABS, nextTab, type LiveTab } from './live-tabs.js';
import { useHashTab } from './useHashTab.hook.js';
import styles from './LiveTabs.module.css';

type TabButtonProps = {
  readonly tab: (typeof LIVE_TABS)[number];
  readonly prefix: string;
  readonly current: LiveTab;
  readonly onSelect: (tab: LiveTab) => void;
};

function TabButton({ tab, prefix, current, onSelect }: TabButtonProps): ReactElement {
  return (
    <button
      id={`${prefix}-${tab.key}-tab`}
      type="button"
      role="tab"
      className={styles.tab}
      aria-selected={tab.key === current}
      aria-controls={`${prefix}-${tab.key}-panel`}
      tabIndex={tab.key === current ? 0 : -1}
      onClick={() => onSelect(tab.key)}
    >
      {tab.label}
    </button>
  );
}

export type LiveTabsProps = { readonly panels: Readonly<Record<LiveTab, ReactNode>> };

// As abas abaixo da sala: uma visível por vez (Operações, Decisões, O que falta, Acertos, Acompanhamento).
export function LiveTabs({ panels }: LiveTabsProps): ReactElement {
  const [current, setCurrent] = useHashTab();
  const prefix = useId();
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const target = nextTab(current, event.key);
    if (target === undefined) return;
    event.preventDefault();
    setCurrent(target);
    document.getElementById(`${prefix}-${target}-tab`)?.focus();
  }
  return (
    <section className={styles.tabs} aria-label="Detalhes da simulação">
      <div
        role="tablist"
        aria-label="Detalhes da simulação"
        className={styles.list}
        onKeyDown={handleKeyDown}
      >
        {LIVE_TABS.map((tab) => (
          <TabButton
            key={tab.key}
            tab={tab}
            prefix={prefix}
            current={current}
            onSelect={setCurrent}
          />
        ))}
      </div>
      <div
        id={`${prefix}-${current}-panel`}
        role="tabpanel"
        aria-labelledby={`${prefix}-${current}-tab`}
        className={styles.panel}
      >
        {panels[current]}
      </div>
    </section>
  );
}
