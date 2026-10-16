// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type KeyboardEvent, type ReactElement } from 'react';

import { trapTab } from './focus-trap.js';
import { optionDomId, RunSwitchList } from './RunSwitchList.component.js';
import { RunSwitchChips, RunSwitchHeader, RunSwitchSearch } from './RunSwitchSearch.component.js';
import { RunSwitchStatus } from './RunSwitchStatus.component.js';
import styles from './RunSwitcher.module.css';
import { useRunSwitchPanel, type RunSwitchPanelInput } from './useRunSwitchPanel.hook.js';

function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>, onClose: () => void): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    onClose();
    return;
  }
  trapTab(event);
}

// Folha de busca: popover sob a barra no computador e tela cheia no celular; o foco entra na busca e Esc devolve ao botão.
export function RunSwitchPanel(input: RunSwitchPanelInput): ReactElement {
  const model = useRunSwitchPanel(input);
  const listId = useId();
  const { active } = model;
  return (
    <div className={styles.overlay}>
      <div className={styles.backdrop} onClick={input.onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Trocar execução"
        className={styles.panel}
        onKeyDown={(event) => handleDialogKeyDown(event, input.onClose)}
      >
        <RunSwitchHeader onClose={input.onClose} />
        <RunSwitchSearch
          listId={listId}
          activeId={active === undefined ? undefined : optionDomId(listId, active)}
          query={model.query}
          onQueryChange={model.setQuery}
          onKeyDown={model.handleInputKeyDown}
        />
        <RunSwitchChips symbols={model.symbols} symbol={model.symbol} onSelect={model.setSymbol} />
        <RunSwitchList
          listId={listId}
          sections={model.sections}
          activeKey={active?.key}
          onChoose={(option) => input.onSelect(option.runId)}
          onHover={model.activate}
        />
        <RunSwitchStatus data={model.data} optionCount={model.optionCount} query={model.query} />
      </div>
    </div>
  );
}
