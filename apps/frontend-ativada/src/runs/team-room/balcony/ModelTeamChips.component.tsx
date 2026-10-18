// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ReactElement } from 'react';

import { ModelTeamSheet } from '../../model-teams/ModelTeamSheet.component.js';
import { OnDemandButton } from '../../model-teams/OnDemandButton.component.js';
import {
  useModelTeamsView,
  type ModelTeamsView,
  type TeamCardModel,
} from '../../model-teams/useModelTeamsView.hook.js';
import type { SeatState } from '../team-room-sequence.js';
import { BALCONY_TEXT, type BalconySlot } from './balcony.constant.js';
import styles from './Balcony.module.css';
import { BalconyAgentSlot } from './BalconyAgentSlot.component.js';
import { buildModelAgent } from './model-agents.js';

function NoTeams({ view }: { readonly view: ModelTeamsView }): ReactElement | null {
  if (view.status === 'absent')
    return <p className={styles.modelsNote}>{BALCONY_TEXT.MODELS_ONLY_LIVE}</p>;
  if (view.status === 'error')
    return <p className={styles.modelsNote}>{BALCONY_TEXT.MODELS_ERROR}</p>;
  return null;
}

type ModelSlotProps = {
  readonly card: TeamCardModel;
  readonly view: ModelTeamsView;
  readonly isActive: boolean;
  readonly onActivate: (slot: BalconySlot) => void;
};

function ModelSlot({ card, view, isActive, onActivate }: ModelSlotProps): ReactElement {
  const state: SeatState = card.latest?.status === 'pending' ? 'thinking' : 'spoken';
  return (
    <BalconyAgentSlot
      agent={buildModelAgent(card, view.status)}
      state={state}
      isActive={isActive}
      onActivate={onActivate}
      renderSheet={(id, isOpen) => (
        <ModelTeamSheet card={card} run={view.run} id={id} isOpen={isOpen}>
          <OnDemandButton card={card} view={view} />
        </ModelTeamSheet>
      )}
    />
  );
}

export type ModelTeamChipsProps = {
  // O balão ativo da varanda (um por vez no celular); sozinha, a lista guarda o seu.
  readonly activeSlot?: BalconySlot | undefined;
  readonly onActivate?: ((slot: BalconySlot) => void) | undefined;
};

// As equipes de MODELO (◆) como personagens, no mesmo molde dos agentes de regra: figura, crachá com nome e provedor,
// estado em ícone + palavra, balão curto com o motivo gravado e a ficha. Desligada ou sem chave fica esmaecida, nunca some.
export function ModelTeamChips({ activeSlot, onActivate }: ModelTeamChipsProps): ReactElement {
  const view = useModelTeamsView();
  const [own, setOwn] = useState<BalconySlot | undefined>(undefined);
  return (
    <div className={styles.models}>
      <p className={styles.modelsHead}>
        <span aria-hidden="true">{BALCONY_TEXT.KIND_MODEL_MARK}</span> {BALCONY_TEXT.MODELS_TITLE}
      </p>
      <NoTeams view={view} />
      <p className={styles.modelsNote}>{BALCONY_TEXT.MODELS_NOTE}</p>
      <ul className={styles.modelCrew}>
        {view.teams.map((card) => (
          <ModelSlot
            key={card.key}
            card={card}
            view={view}
            isActive={(activeSlot ?? own) === card.key}
            onActivate={onActivate ?? setOwn}
          />
        ))}
      </ul>
    </div>
  );
}
