// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { useLiveStatusQuery } from '../live-tracking/live-status.query.js';
import type { LiveStatus } from '../live-tracking/live-status.validation.js';
import { CompactTeamFrame } from './CompactTeamFrame.component.js';
import { CompactTeamMoment } from './CompactTeamMoment.component.js';
import { CompactTeamNotice } from './CompactTeamNotice.component.js';
import { CompactTeamSeats } from './CompactTeamSeats.component.js';
import styles from './CompactTeam.module.css';
import { useCompactTeamModel, type CompactTeamModel } from './useCompactTeamModel.hook.js';
import { describeWaitingTeam } from './compact-team-waiting.js';
import { describeAnnouncement } from './team-room-lines.js';
import { TEAM_ROOM_TEXT } from './team-room.constant.js';

export type CompactTeamProps = {
  readonly runId: string;
  // A vela que o gráfico aponta (mouse ou teclado); sem ela a equipe fala da vela mais recente.
  readonly pointedOpenTime?: number | undefined;
  readonly isAnimationOn?: boolean;
  // Com a sala grande recolhida, é aqui que o leitor de tela ouve a vela nova.
  readonly shouldAnnounce?: boolean;
};

function momentText({ view, isPointed, closedText }: CompactTeamModel): string {
  if (view === undefined) return TEAM_ROOM_TEXT.POINTED_WITHOUT_SPEECH;
  return isPointed
    ? `${TEAM_ROOM_TEXT.POINTED_CANDLE} ${closedText}`
    : `${TEAM_ROOM_TEXT.LATEST_CANDLE} ${closedText}`;
}

type LoadedProps = CompactTeamProps & { readonly status: LiveStatus };

function LoadedTeam(props: LoadedProps): ReactElement {
  const timeZone = useUserTimeZone();
  const model = useCompactTeamModel(props);
  if (model === undefined) {
    return <CompactTeamNotice text={describeWaitingTeam({ run: props.status.run, timeZone })} />;
  }
  const { view, isAnnounced } = model;
  const announcement = props.shouldAnnounce === true && isAnnounced && view !== undefined;
  return (
    <>
      <CompactTeamMoment text={momentText(model)} isPointed={model.isPointed} />
      <CompactTeamSeats view={view} auditor={model.auditor} step={model.step} />
      <p className={styles.disclaimer}>{TEAM_ROOM_TEXT.DISCLAIMER}</p>
      <p className={styles.visuallyHidden} role="status" aria-live="polite">
        {announcement ? describeAnnouncement(view, model.closedText) : ''}
      </p>
    </>
  );
}

function CompactTeamBody(props: CompactTeamProps): ReactElement {
  const query = useLiveStatusQuery(props.runId, true);
  if (query.data !== undefined) return <LoadedTeam {...props} status={query.data} />;
  if (!query.isError) return <CompactTeamNotice text={TEAM_ROOM_TEXT.COMPACT_LOADING} />;
  return (
    <CompactTeamNotice
      text={TEAM_ROOM_TEXT.COMPACT_ERROR}
      isError
      onRetry={() => void query.refetch()}
    />
  );
}

// A equipe junto do gráfico: bonequinhos compactos com o balão de cada especialista, o resumo do placar e o auditor. Na vela
// mais recente anima só quando chega vela nova; apontando outra vela mostra o que cada um disse NAQUELA vela. Nunca some:
// carregando, com erro ou sem decisões ainda, a coluna diz o que está acontecendo.
export function CompactTeam(props: CompactTeamProps): ReactElement {
  return (
    <CompactTeamFrame>
      <CompactTeamBody {...props} />
    </CompactTeamFrame>
  );
}
