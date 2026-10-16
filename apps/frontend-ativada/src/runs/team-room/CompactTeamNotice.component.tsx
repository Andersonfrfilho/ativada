// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Icon } from '../../layout/Icon.component.js';
import controls from '../../styles/Controls.module.css';
import styles from './CompactTeam.module.css';
import { TEAM_ROOM_TEXT } from './team-room.constant.js';

export type CompactTeamNoticeProps = {
  readonly text: string;
  readonly isError?: boolean;
  readonly onRetry?: () => void;
};

// O miolo da moldura da equipe sem opinião para mostrar (carregando, erro, sem decisões, execução histórica): a coluna nunca some, diz o porquê.
export function CompactTeamNotice(props: CompactTeamNoticeProps): ReactElement {
  const { text, isError = false, onRetry } = props;
  return (
    <>
      <p className={styles.moment} role={isError ? 'alert' : 'status'}>
        <Icon name={isError ? 'alert' : 'info'} size={16} />
        {text}
      </p>
      {onRetry === undefined ? null : (
        <button type="button" className={controls.button} onClick={onRetry}>
          {TEAM_ROOM_TEXT.RETRY}
        </button>
      )}
    </>
  );
}
