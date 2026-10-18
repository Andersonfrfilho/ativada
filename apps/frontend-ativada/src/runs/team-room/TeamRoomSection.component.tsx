// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement, ReactNode } from 'react';

import { Card } from '../../layout/Card.component.js';
import controls from '../../styles/Controls.module.css';
import { OFFICE_ANCHOR } from '../live-tracking/live-anchors.js';
import { useLiveStatusQuery } from '../live-tracking/live-status.query.js';
import type { LiveStatus } from '../live-tracking/live-status.validation.js';
import { ModelTeamsRunProvider } from '../model-teams/ModelTeamsRun.context.js';
import { TeamRoomCard } from './TeamRoomCard.component.js';
import { LayoutSwitch } from './TeamRoomControls.component.js';
import { TEAM_ROOM_TEXT } from './team-room.constant.js';
import { useTeamRoomModel, type TeamRoomModelInput } from './useTeamRoomModel.hook.js';

export type TeamRoomSectionProps = Omit<TeamRoomModelInput, 'status'>;

type PlaceholderProps = TeamRoomSectionProps & { readonly children: ReactNode };

// Sem falas para mostrar a sala continua inteira: o botão de layout segue à mão e o gráfico (o monitor) não some.
function RoomPlaceholder(props: PlaceholderProps): ReactElement {
  const { preference, onPreferenceChange, monitor, children } = props;
  return (
    <>
      <Card
        id={OFFICE_ANCHOR}
        title={TEAM_ROOM_TEXT.TITLE}
        icon="team"
        aside={<LayoutSwitch preference={preference} onChange={onPreferenceChange} />}
      >
        {children}
      </Card>
      {monitor}
    </>
  );
}

function EmptyRoom({
  status,
  ...props
}: TeamRoomSectionProps & { readonly status: LiveStatus }): ReactElement {
  const message =
    status.triggers.status === 'unavailable'
      ? status.triggers.message
      : TEAM_ROOM_TEXT.WAITING_FOR_CANDLE;
  return (
    <RoomPlaceholder {...props}>
      <p className={controls.muted} role="status">
        {message}
      </p>
    </RoomPlaceholder>
  );
}

function LoadedRoom(props: TeamRoomModelInput): ReactElement {
  const model = useTeamRoomModel(props);
  return model === undefined ? <EmptyRoom {...props} /> : <TeamRoomCard {...model} />;
}

// "Sala da equipe" (spec 011, versão 1): a mesma consulta do acompanhamento ao vivo; nenhum polling novo.
export function TeamRoomSection(props: TeamRoomSectionProps): ReactElement {
  return (
    <ModelTeamsRunProvider runId={props.runId}>
      <TeamRoomSectionBody {...props} />
    </ModelTeamsRunProvider>
  );
}

function TeamRoomSectionBody(props: TeamRoomSectionProps): ReactElement {
  const status = useLiveStatusQuery(props.runId, true);
  if (status.data === undefined) {
    return (
      <RoomPlaceholder {...props}>
        <p
          className={status.isError ? controls.error : controls.muted}
          role={status.isError ? 'alert' : 'status'}
        >
          {status.isError ? TEAM_ROOM_TEXT.ERROR : TEAM_ROOM_TEXT.LOADING}
        </p>
        {status.isError ? (
          <button type="button" className={controls.button} onClick={() => void status.refetch()}>
            Tentar de novo
          </button>
        ) : null}
      </RoomPlaceholder>
    );
  }
  return <LoadedRoom {...props} status={status.data} />;
}
