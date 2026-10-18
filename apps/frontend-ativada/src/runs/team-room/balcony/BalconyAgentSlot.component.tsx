// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, useRef, type ReactElement } from 'react';

import { GLOSSARY_TERM } from '../../../glossary/glossary.constant.js';
import { Term } from '../../../glossary/Term.component.js';
import { Icon } from '../../../layout/Icon.component.js';
import { StatusChip } from '../../live-tracking/StatusChip.component.js';
import type { SeatState } from '../team-room-sequence.js';
import { TeamFigure } from '../TeamFigure.component.js';
import type { BalconyAgent } from './balcony-agents.js';
import { BALCONY_TEXT, type BalconySlot } from './balcony.constant.js';
import styles from './Balcony.module.css';
import { useLeaderFocus } from './leader-focus.context.js';
import { useBadgeSheet } from './useBadgeSheet.hook.js';

export type SheetRenderer = (id: string, isOpen: boolean) => ReactElement;

export type BalconyAgentSlotProps = {
  readonly agent: BalconyAgent;
  readonly state: SeatState;
  readonly isActive: boolean;
  readonly onActivate: (slot: BalconySlot) => void;
  // A ficha própria do agente (equipes de modelo); sem ela vale a ficha de regra.
  readonly renderSheet?: SheetRenderer | undefined;
};

function markOf(agent: BalconyAgent): string {
  return agent.kind === 'model' ? BALCONY_TEXT.KIND_MODEL_MARK : BALCONY_TEXT.KIND_RULE_MARK;
}

function Bubble({ agent }: { readonly agent: BalconyAgent }): ReactElement {
  const { vote, line, horizon } = agent;
  return (
    <div className={styles.bubble} data-tone={agent.tone}>
      <span className={styles.dots} aria-hidden="true">
        •••
      </span>
      {vote === undefined ? null : (
        <StatusChip tone={vote.tone} icon={vote.icon}>
          {vote.word}
        </StatusChip>
      )}
      {line === undefined ? null : (
        <span className={styles.bubbleLine}>
          {agent.lineTerm === undefined ? line : <Term term={agent.lineTerm}>{line}</Term>}
        </span>
      )}
      {horizon === undefined ? null : <span className={styles.bubbleHorizon}>{horizon}</span>}
    </div>
  );
}

export function Sheet({
  agent,
  id,
  isOpen,
}: {
  agent: BalconyAgent;
  id: string;
  isOpen: boolean;
}): ReactElement {
  return (
    <div
      id={id}
      role="group"
      aria-label={`Ficha de ${agent.name}`}
      hidden={!isOpen}
      className={styles.sheet}
    >
      <strong>
        {BALCONY_TEXT.KIND_RULE_MARK}{' '}
        <Term term={GLOSSARY_TERM.RULE_AGENT}>{BALCONY_TEXT.KIND_RULE}</Term> · {agent.roleFull}
      </strong>
      <ul>
        {agent.facts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
        {agent.horizon === undefined ? null : <li>{agent.horizon}</li>}
      </ul>
    </div>
  );
}

type BadgeProps = {
  readonly agent: BalconyAgent;
  readonly onActivate: (slot: BalconySlot) => void;
  // A ficha própria do agente (equipes de modelo); sem ela vale a ficha de regra.
  readonly renderSheet?: SheetRenderer | undefined;
  readonly onLeave: () => void;
};

// O crachá no parapeito: sempre visível (nome, selo e cargo curto); clique ou Enter abre a ficha.
function Badge({ agent, onActivate, onLeave, renderSheet }: BadgeProps): ReactElement {
  const sheetId = useId();
  const sheet = useBadgeSheet();
  return (
    <div ref={sheet.rootRef} className={styles.badgeRoot}>
      <button
        ref={sheet.buttonRef}
        type="button"
        className={styles.badge}
        data-team={agent.teamKey}
        aria-label={agent.ariaLabel}
        aria-expanded={sheet.isOpen}
        aria-controls={sheetId}
        onClick={() => {
          onActivate(agent.slot);
          sheet.toggle();
        }}
        onFocus={() => onActivate(agent.slot)}
        onMouseEnter={() => onActivate(agent.slot)}
        onMouseLeave={onLeave}
        onBlur={onLeave}
      >
        <span className={styles.badgeName}>
          <span aria-hidden="true">{markOf(agent)}</span> {agent.name}
        </span>
        <span className={styles.seal}>
          <Icon name={agent.seal.icon} size={12} />
          {agent.seal.word}
        </span>
        <span className={styles.role}>{agent.roleShort}</span>
      </button>
      {renderSheet === undefined ? (
        <Sheet agent={agent} id={sheetId} isOpen={sheet.isOpen} />
      ) : (
        renderSheet(sheetId, sheet.isOpen)
      )}
    </div>
  );
}

// Um agente em pé na varanda: o bonequinho olhando o gráfico, o crachá no parapeito e o balão curto.
export function BalconyAgentSlot({
  agent,
  state,
  isActive,
  onActivate,
  renderSheet,
}: BalconyAgentSlotProps): ReactElement {
  const slotRef = useRef<HTMLLIElement>(null);
  const leader = useLeaderFocus();
  function handleActivate(slot: BalconySlot): void {
    onActivate(slot);
    const bubble = slotRef.current?.lastElementChild;
    if (bubble instanceof HTMLElement) leader?.setFocus({ slot, element: bubble });
  }
  return (
    <li
      ref={slotRef}
      className={styles.slot}
      data-slot={agent.slot}
      data-state={state}
      data-active={isActive}
      data-kind={agent.kind}
    >
      <div className={styles.figure}>
        <TeamFigure role={agent.figureRole} tone={agent.tone} state={state} isRinging={false} />
      </div>
      <Badge
        agent={agent}
        onActivate={handleActivate}
        onLeave={() => leader?.setFocus(undefined)}
        renderSheet={renderSheet}
      />
      <Bubble agent={agent} />
    </li>
  );
}
