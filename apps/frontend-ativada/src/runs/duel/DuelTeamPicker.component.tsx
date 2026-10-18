// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { Icon } from '../../layout/Icon.component.js';
import { MODEL_TEAM_VISUAL, type ModelTeamKey } from '../model-teams/model-teams.constant.js';
import { useMyModelTeamsQuery } from '../model-teams/model-teams.query.js';
import type { TeamView } from '../model-teams/model-teams.validation.js';
import { describeProviderBadge } from '../model-teams/team-badge.js';
import controls from '../../styles/Controls.module.css';
import styles from './Duel.module.css';

const OFF_PHRASE = 'desligada: ligue nas preferências para entrar no duelo';

type PickProps = {
  readonly team: TeamView;
  readonly isPicked: boolean;
  readonly onToggle: (team: ModelTeamKey) => void;
};

function Pick({ team, isPicked, onToggle }: PickProps): ReactElement {
  const timeZone = useUserTimeZone();
  const provider = describeProviderBadge(team, timeZone);
  const visual = MODEL_TEAM_VISUAL[team.teamKey];
  const isBlocked = !team.isEnabled || !team.providerStatus.isAvailable;
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
          {team.isEnabled ? (
            <>
              <Icon name={provider.icon} size={12} /> {provider.word}
            </>
          ) : (
            OFF_PHRASE
          )}
        </span>
      </label>
    </li>
  );
}

// As equipes que podem entrar: ligadas e com o provedor pronto. As outras aparecem com a frase do motivo.
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
  return (
    <fieldset className={styles.fieldset}>
      <legend>Equipes ◆ no duelo</legend>
      <ul className={styles.runLinks}>
        {(query.data?.teams ?? []).map((team) => (
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
