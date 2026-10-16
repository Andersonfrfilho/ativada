// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Icon } from '../../layout/Icon.component.js';
import styles from './TeamRoomCard.module.css';
import { TEAM_LAYOUT, type TeamLayout, type TeamRoomPreference } from './team-room-preference.js';
import { TEAM_ROOM_TEXT } from './team-room.constant.js';

export type TeamRoomControlsProps = {
  readonly preference: TeamRoomPreference;
  readonly onChange: (change: Partial<TeamRoomPreference>) => void;
  readonly onReplay: () => void;
};

type LayoutOption = { readonly layout: TeamLayout; readonly text: string };

const LAYOUT_OPTIONS: readonly LayoutOption[] = [
  { layout: TEAM_LAYOUT.CHART_AND_TEAM, text: TEAM_ROOM_TEXT.LAYOUT_CHART_AND_TEAM },
  { layout: TEAM_LAYOUT.ROOM_WITH_CHART, text: TEAM_ROOM_TEXT.LAYOUT_ROOM_WITH_CHART },
];

export function LayoutSwitch({
  preference,
  onChange,
}: Pick<TeamRoomControlsProps, 'preference' | 'onChange'>): ReactElement {
  return (
    <div className={styles.switch} role="group" aria-label="Como mostrar a equipe">
      {LAYOUT_OPTIONS.map((option) => (
        <button
          key={option.layout}
          type="button"
          className={styles.switchButton}
          aria-pressed={preference.layout === option.layout}
          onClick={() => onChange({ layout: option.layout })}
        >
          {option.text}
        </button>
      ))}
    </div>
  );
}

// Repetir a animação, ligar e desligar a animação e recolher a sala: preferências de tela, lembradas neste navegador.
export function TeamRoomControls(props: TeamRoomControlsProps): ReactElement {
  const { preference, onChange, onReplay } = props;
  return (
    <div className={styles.controls}>
      <LayoutSwitch {...props} />
      <button
        type="button"
        className={styles.tool}
        onClick={onReplay}
        disabled={preference.isCollapsed}
      >
        <Icon name="replay" size={16} />
        {TEAM_ROOM_TEXT.REPLAY}
      </button>
      <button
        type="button"
        className={styles.tool}
        aria-pressed={preference.isAnimationOn}
        onClick={() => onChange({ isAnimationOn: !preference.isAnimationOn })}
      >
        {preference.isAnimationOn ? TEAM_ROOM_TEXT.ANIMATION_ON : TEAM_ROOM_TEXT.ANIMATION_OFF}
      </button>
      <button
        type="button"
        className={styles.tool}
        aria-expanded={!preference.isCollapsed}
        onClick={() => onChange({ isCollapsed: !preference.isCollapsed })}
      >
        {preference.isCollapsed ? TEAM_ROOM_TEXT.SHOW : TEAM_ROOM_TEXT.HIDE}
      </button>
    </div>
  );
}
