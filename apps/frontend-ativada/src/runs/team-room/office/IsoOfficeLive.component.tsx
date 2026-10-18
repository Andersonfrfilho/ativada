// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useModelTeamsView } from '../../model-teams/useModelTeamsView.hook.js';
import { buildBalconyAgents } from '../balcony/balcony-agents.js';
import { buildModelAgent } from '../balcony/model-agents.js';
import type { AuditorView, TeamRoomView } from '../team-room.types.js';
import { IsoOffice } from './IsoOffice.component.js';
import type { OfficeModel } from './useOfficeModel.hook.js';

export type IsoOfficeLiveProps = {
  readonly view: TeamRoomView;
  readonly auditor: AuditorView | undefined;
  readonly office: OfficeModel;
  readonly isAnimationOn: boolean;
  readonly meetingKey: number | undefined;
};

// O escritório isométrico com a equipe de verdade: os seis agentes de regra (nome e cargo sempre à vista) e SÓ as equipes de modelo
// ligadas (ligada com problema aparece com o estado em palavra). Nenhuma consulta nova: usa o que o cartão e a conta já leem.
export function IsoOfficeLive({
  view,
  auditor,
  office,
  isAnimationOn,
  meetingKey,
}: IsoOfficeLiveProps): ReactElement {
  const models = useModelTeamsView();
  const agents = [
    ...buildBalconyAgents({ view, auditor, horizon: undefined }),
    ...models.teams.map((card) => buildModelAgent(card, models.status)),
  ];
  return (
    <IsoOffice
      agents={agents}
      clock={office.clock}
      screen={office.screen}
      isAnimationOn={isAnimationOn}
      meetingKey={meetingKey}
    />
  );
}
