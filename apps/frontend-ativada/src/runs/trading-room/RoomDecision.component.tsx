// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { formatTimeInZone } from '../../format/zoned-time.js';
import type { LiveStatus } from '../live-tracking/live-status.validation.js';
import { DecisionContent } from './DecisionContent.component.js';
import { TRADING_ROOM_TEXT } from './trading-room.constant.js';
import { useTradingRoomModel } from './useTradingRoomModel.hook.js';
import styles from './TradingRoom.module.css';

export type RoomDecisionProps = { readonly runId: string; readonly status: LiveStatus };

// A decisão da equipe logo abaixo do telão: comprar a, vender no alvo, lucro previsto, proteção e o placar da Alice.
export function RoomDecision({ runId, status }: RoomDecisionProps): ReactElement | null {
  const timeZone = useUserTimeZone();
  const leader = useTradingRoomModel(runId, status).opinions.find((item) => item.kind === 'leader');
  if (leader === undefined) return null;
  const next = status.run.nextDecisionAt;
  const label =
    next === null
      ? TRADING_ROOM_TEXT.DECISION_NOW
      : `${TRADING_ROOM_TEXT.DECISION_NOW} · próxima vela ${formatTimeInZone(next, timeZone)}`;
  return (
    <div className={styles.decisionBar}>
      <DecisionContent leader={leader} label={label} hasFoot={false} />
    </div>
  );
}
