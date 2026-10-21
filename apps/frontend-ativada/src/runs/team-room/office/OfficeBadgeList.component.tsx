// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement } from 'react';

import { Icon } from '../../../layout/Icon.component.js';
import { buildBalconyAgents, type BalconyAgent } from '../balcony/balcony-agents.js';
import { Sheet } from '../balcony/BalconyAgentSlot.component.js';
import { BALCONY_TEXT } from '../balcony/balcony.constant.js';
import { ModelTeamChips } from '../balcony/ModelTeamChips.component.js';
import { useBadgeSheet } from '../balcony/useBadgeSheet.hook.js';
import type { AuditorView, TeamRoomView } from '../team-room.types.js';
import { OFFICE_TEXT } from './office.constant.js';
import styles from './Office.module.css';

function BadgeItem({ agent }: { readonly agent: BalconyAgent }): ReactElement {
  const sheetId = useId();
  const sheet = useBadgeSheet();
  return (
    <li className={styles.badgeItem}>
      <div ref={sheet.rootRef} className={styles.badgeRoot}>
        <button
          ref={sheet.buttonRef}
          type="button"
          className={styles.badgeButton}
          aria-label={agent.ariaLabel}
          aria-expanded={sheet.isOpen}
          aria-controls={sheetId}
          onClick={sheet.toggle}
        >
          <strong>
            <span aria-hidden="true">{BALCONY_TEXT.KIND_RULE_MARK}</span> {agent.name}
          </strong>
          <span>{agent.roleFull}</span>
          <span className={styles.badgeSeal}>
            <Icon name={agent.seal.icon} size={12} />
            {agent.seal.word}
          </span>
        </button>
        <Sheet agent={agent} id={sheetId} isOpen={sheet.isOpen} />
      </div>
    </li>
  );
}

export type OfficeBadgeListProps = {
  readonly view: TeamRoomView;
  readonly auditor: AuditorView | undefined;
};

// A lista equivalente ao palco (que é decorativo): um crachá de 44 px por pessoa, com a ficha, e uma linha para os modelos.
export function OfficeBadgeList({ view, auditor }: OfficeBadgeListProps): ReactElement {
  const agents = buildBalconyAgents({ view, auditor, horizon: undefined });
  return (
    <section aria-label={OFFICE_TEXT.BADGES} className={styles.badges}>
      <h4 className={styles.badgesTitle}>{OFFICE_TEXT.BADGES}</h4>
      <ul className={styles.badgeList}>
        {agents.map((agent) => (
          <BadgeItem key={agent.slot} agent={agent} />
        ))}
      </ul>
      <ModelTeamChips />
    </section>
  );
}
