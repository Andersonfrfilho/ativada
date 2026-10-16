// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import styles from './TeamRoomCard.module.css';
import { TEAM_ROOM_TEXT } from './team-room.constant.js';

export type TeamRoomNavigatorProps = {
  readonly closedText: string;
  readonly isReviewing: boolean;
  readonly canGoPrevious: boolean;
  readonly canGoNext: boolean;
  readonly isLoadingOlder: boolean;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onBackToNow: () => void;
};

// Rever velas anteriores (sem animação): o selo diz qual vela está na sala e "Voltar para agora" desfaz.
export function TeamRoomNavigator(props: TeamRoomNavigatorProps): ReactElement {
  const { closedText, isReviewing, canGoPrevious, canGoNext, isLoadingOlder } = props;
  return (
    <div className={styles.navigator}>
      <span className={isReviewing ? `${styles.seal} ${styles.sealReview}` : styles.seal}>
        {isReviewing ? 'Revendo a vela que fechou ' : 'Vela que fechou '}
        {closedText}
      </span>
      <button
        type="button"
        className={styles.tool}
        disabled={!canGoPrevious}
        onClick={props.onPrevious}
      >
        {isLoadingOlder ? 'Carregando…' : TEAM_ROOM_TEXT.PREVIOUS}
      </button>
      <button type="button" className={styles.tool} disabled={!canGoNext} onClick={props.onNext}>
        {TEAM_ROOM_TEXT.NEXT}
      </button>
      {isReviewing ? (
        <button type="button" className={styles.tool} onClick={props.onBackToNow}>
          {TEAM_ROOM_TEXT.BACK_TO_NOW}
        </button>
      ) : null}
    </div>
  );
}
