// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { Icon } from '../../layout/Icon.component.js';
import { EnableTeamsLink } from '../model-teams/EnableTeamsLink.component.js';
import { MODEL_TEAM_VISUAL, type ModelTeamKey } from '../model-teams/model-teams.constant.js';
import { useMyModelTeamsQuery } from '../model-teams/model-teams.query.js';
import type { TeamView } from '../model-teams/model-teams.validation.js';
import { describeProviderBadge } from '../model-teams/team-badge.js';
import controls from '../../styles/Controls.module.css';
import styles from './Duel.module.css';

type PickProps = {
  readonly team: TeamView;
  readonly isPicked: boolean;
  readonly onToggle: (team: ModelTeamKey) => void;
};

function Pick({ team, isPicked, onToggle }: PickProps): ReactElement {
  const timeZone = useUserTimeZone();
  const provider = describeProviderBadge(team, timeZone);
  const visual = MODEL_TEAM_VISUAL[team.teamKey];
  const isBlocked = !team.providerStatus.isAvailable;
  return (
    <li>
      <label className={styles.pick}>
        <input
          type="checkbox"
          checked={isPicked && !isBlocked}
          disabled={isBlocked}
          onChange={() => onToggle(team.teamKey)}
        />
        <span>
          <span aria-hidden="true">◆</span> <strong>{visual.name}</strong> ({visual.provider})
        </span>
        <span className={styles.why}>
          <Icon name={provider.icon} size={12} /> {provider.word}
        </span>
      </label>
    </li>
  );
}

// As equipes LIGADAS; as desligadas não aparecem (nenhuma ligada: só o link para Conta). Ligada sem provedor pronto
// aparece bloqueada, com a palavra do motivo.
export function DuelTeamPicker({
  picked,
  onToggle,
}: {
  readonly picked: readonly ModelTeamKey[];
  readonly onToggle: (team: ModelTeamKey) => void;
}): ReactElement {
  const query = useMyModelTeamsQuery();
  if (query.isError) {
    return (
      <p role="status" className={controls.muted}>
        Não foi possível carregar as equipes agora; o duelo precisa delas.
      </p>
    );
  }
  const teams = (query.data?.teams ?? []).filter((team) => team.isEnabled);
  if (query.data !== undefined && teams.length === 0) return <EnableTeamsLink />;
  return (
    <fieldset className={styles.fieldset}>
      <legend>Equipes ◆ no duelo</legend>
      <ul className={styles.runLinks}>
        {teams.map((team) => (
          <Pick
            key={team.teamKey}
            team={team}
            isPicked={picked.includes(team.teamKey)}
            onToggle={onToggle}
          />
        ))}
      </ul>
    </fieldset>
  );
}
