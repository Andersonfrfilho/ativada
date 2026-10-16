// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Card } from '../../layout/Card.component.js';
import controls from '../../styles/Controls.module.css';
import { useLiveStatusQuery } from '../live-tracking/live-status.query.js';
import type { LiveStatus } from '../live-tracking/live-status.validation.js';
import { TeamRoomCard } from './TeamRoomCard.component.js';
import { TEAM_ROOM_TEXT } from './team-room.constant.js';
import { useTeamRoomModel, type TeamRoomModelInput } from './useTeamRoomModel.hook.js';

export type TeamRoomSectionProps = Omit<TeamRoomModelInput, 'status'>;

function EmptyRoom({ status }: { readonly status: LiveStatus }): ReactElement {
  const message =
    status.triggers.status === 'unavailable'
      ? status.triggers.message
      : TEAM_ROOM_TEXT.WAITING_FOR_CANDLE;
  return (
    <Card title={TEAM_ROOM_TEXT.TITLE} icon="team">
      <p className={controls.muted} role="status">
        {message}
      </p>
    </Card>
  );
}

function LoadedRoom(props: TeamRoomModelInput): ReactElement {
  const model = useTeamRoomModel(props);
  return model === undefined ? <EmptyRoom status={props.status} /> : <TeamRoomCard {...model} />;
}

// "Sala da equipe" (spec 011, versão 1): a mesma consulta do acompanhamento ao vivo; nenhum polling novo.
export function TeamRoomSection(props: TeamRoomSectionProps): ReactElement {
  const status = useLiveStatusQuery(props.runId, true);
  if (status.data === undefined) {
    return (
      <Card title={TEAM_ROOM_TEXT.TITLE} icon="team">
        <p
          className={status.isError ? controls.error : controls.muted}
          role={status.isError ? 'alert' : 'status'}
        >
          {status.isError ? TEAM_ROOM_TEXT.ERROR : TEAM_ROOM_TEXT.LOADING}
        </p>
      </Card>
    );
  }
  return <LoadedRoom {...props} status={status.data} />;
}
