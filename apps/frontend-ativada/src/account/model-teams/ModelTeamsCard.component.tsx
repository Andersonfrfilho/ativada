// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ChangeEvent, ReactElement } from 'react';

import { GLOSSARY_TERM } from '../../glossary/glossary.constant.js';
import { Term } from '../../glossary/Term.component.js';
import { Card } from '../../layout/Card.component.js';
import { Icon } from '../../layout/Icon.component.js';
import { describeProviderBadge } from '../../runs/model-teams/team-badge.js';
import {
  useMyModelTeamsQuery,
  useSetModelTeamMutation,
} from '../../runs/model-teams/model-teams.query.js';
import type { TeamView } from '../../runs/model-teams/model-teams.validation.js';
import controls from '../../styles/Controls.module.css';
import { useUserTimeZone } from '../useUserTimeZone.hook.js';
import styles from './ModelTeamsCard.module.css';
import { MODEL_TEAMS_PREFERENCE_TEXT } from './model-teams-preference.constant.js';

type RowProps = {
  readonly team: TeamView;
  readonly isEnabled: boolean;
  readonly isBusy: boolean;
  readonly onChange: (team: TeamView, isEnabled: boolean) => void;
};

function TeamRow({ team, isEnabled, isBusy, onChange }: RowProps): ReactElement {
  const timeZone = useUserTimeZone();
  const provider = describeProviderBadge(team, timeZone);
  return (
    <li className={styles.row} data-team={team.teamKey}>
      <label className={styles.switch}>
        <input
          type="checkbox"
          role="switch"
          checked={isEnabled}
          disabled={isBusy}
          aria-label={`Equipe ${team.displayName}: ${isEnabled ? 'ligada' : 'desligada'}`}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(team, event.target.checked)}
        />
        <span className={styles.name}>
          <span className={styles.diamond} aria-hidden="true">
            ◆
          </span>
          {team.displayName}
        </span>
        <span className={styles.word}>{isEnabled ? 'Ligada' : 'Desligada'}</span>
      </label>
      <p className={styles.detail}>
        {team.modelFamily} · {team.cloudLabel}
      </p>
      <p className={styles.detail}>
        {MODEL_TEAMS_PREFERENCE_TEXT.PROVIDER}{' '}
        <span className={styles.provider}>
          <Icon name={provider.icon} size={14} />
          {provider.word}
        </span>
      </p>
    </li>
  );
}

function Teams(): ReactElement {
  const query = useMyModelTeamsQuery();
  const update = useSetModelTeamMutation();
  if (query.isError) {
    return (
      <p role="alert" className={controls.error}>
        {MODEL_TEAMS_PREFERENCE_TEXT.LOAD_ERROR}
      </p>
    );
  }
  if (query.data === undefined) return <p className={controls.muted}>Carregando as equipes…</p>;
  const pending = update.isPending ? update.variables : undefined;
  return (
    <>
      <p className={controls.muted}>{query.data.notice}</p>
      <ul className={styles.list}>
        {query.data.teams.map((team) => (
          <TeamRow
            key={team.teamKey}
            team={team}
            isEnabled={pending?.teamKey === team.teamKey ? pending.isEnabled : team.isEnabled}
            isBusy={pending?.teamKey === team.teamKey}
            onChange={(chosen, isEnabled) => update.mutate({ teamKey: chosen.teamKey, isEnabled })}
          />
        ))}
      </ul>
      {update.isError ? (
        <p role="alert" className={controls.error}>
          {MODEL_TEAMS_PREFERENCE_TEXT.SAVE_ERROR}
        </p>
      ) : null}
    </>
  );
}

// Preferências das equipes de modelo (RF15): um interruptor por equipe, DESLIGADO por padrão, porque ligar gasta API.
export function ModelTeamsCard(): ReactElement {
  return (
    <Card title="Equipes de modelo" id="equipes" icon="team">
      <p className={controls.muted}>
        <Term term={GLOSSARY_TERM.MODEL_TEAM}>{MODEL_TEAMS_PREFERENCE_TEXT.LEAD}</Term>{' '}
        {MODEL_TEAMS_PREFERENCE_TEXT.COST}
      </p>
      <Teams />
      <p className={controls.muted}>{MODEL_TEAMS_PREFERENCE_TEXT.FOOTER}</p>
    </Card>
  );
}
