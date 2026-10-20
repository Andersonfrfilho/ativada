// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { ModelTeamsRunProvider } from '../model-teams/ModelTeamsRun.context.js';
import { ModelTeamChips } from '../team-room/balcony/ModelTeamChips.component.js';
import { TRADING_ROOM_TEXT } from './trading-room.constant.js';
import styles from './TradingRoom.module.css';

// As equipes ◆ ligadas com a ficha de cada uma e o "Pedir opinião agora" (spec 015), abaixo da lista da sala.
export function RoomModelTeams({ runId }: { readonly runId: string }): ReactElement {
  return (
    <ModelTeamsRunProvider runId={runId}>
      <section className={styles.models} aria-label={TRADING_ROOM_TEXT.MODELS_LABEL}>
        <ModelTeamChips />
      </section>
    </ModelTeamsRunProvider>
  );
}
