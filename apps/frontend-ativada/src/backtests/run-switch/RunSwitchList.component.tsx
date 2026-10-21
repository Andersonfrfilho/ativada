// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useEffect, type ReactElement } from 'react';

import { Icon } from '../../layout/Icon.component.js';
import type { SwitchOption, SwitchSection } from './run-switch-options.js';
import styles from './RunSwitcher.module.css';

export type RunSwitchListProps = {
  readonly listId: string;
  readonly sections: readonly SwitchSection[];
  readonly activeKey: string | undefined;
  readonly onChoose: (option: SwitchOption) => void;
  readonly onHover: (option: SwitchOption) => void;
};

export function optionDomId(listId: string, option: SwitchOption): string {
  return `${listId}-option-${option.key}`;
}

type OptionRowProps = RunSwitchListProps & { readonly option: SwitchOption };

function OptionRow({ listId, option, activeKey, onChoose, onHover }: OptionRowProps): ReactElement {
  const isActive = option.key === activeKey;
  const look = option.look;
  return (
    <div
      role="option"
      id={optionDomId(listId, option)}
      aria-selected={isActive}
      className={isActive ? `${styles.option} ${styles.optionActive}` : styles.option}
      onClick={() => onChoose(option)}
      onMouseMove={() => (isActive ? undefined : onHover(option))}
    >
      <span className={styles.optionTitle}>
        {option.title}
        {option.isCurrent ? <span className={styles.currentTag}>Atual</span> : null}
      </span>
      <span className={styles.optionDetail}>{option.detail}</span>
      {look === undefined ? null : (
        <span className={`${styles.look} ${styles[look.tone] ?? ''}`}>
          <Icon name={look.icon} size={14} />
          {look.text}
        </span>
      )}
    </div>
  );
}

// A lista pesquisável: grupos com título, opções com resultado (ícone + palavra + cor) e a opção ativa rolada para a vista.
export function RunSwitchList(props: RunSwitchListProps): ReactElement {
  const { listId, sections, activeKey } = props;
  useEffect(() => {
    const active = sections.flatMap((section) => section.options).find((o) => o.key === activeKey);
    if (active !== undefined) {
      document.getElementById(optionDomId(listId, active))?.scrollIntoView({ block: 'nearest' });
    }
  }, [listId, sections, activeKey]);
  return (
    <div role="listbox" id={listId} aria-label="Execuções" className={styles.list}>
      {sections.map((section) => (
        <div key={section.id} role="group" aria-labelledby={`${listId}-${section.id}`}>
          <div id={`${listId}-${section.id}`} className={styles.groupTitle}>
            {section.title}
          </div>
          {section.options.map((option) => (
            <OptionRow key={option.key} {...props} option={option} />
          ))}
        </div>
      ))}
    </div>
  );
}
