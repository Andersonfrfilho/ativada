// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Icon } from '../../../layout/Icon.component.js';
import { useModelTeamsView, type TeamCardModel } from '../../model-teams/useModelTeamsView.hook.js';
import { BALCONY_TEXT } from '../balcony/balcony.constant.js';
import { OFFICE_TEXT } from './office.constant.js';
import styles from './Office.module.css';

function TeamCard({ card }: { readonly card: TeamCardModel }): ReactElement {
  const { badge } = card;
  return (
    <li className={styles.modelCard} data-team={card.key}>
      <strong>
        <span aria-hidden="true">{BALCONY_TEXT.KIND_MODEL_MARK}</span> {card.name}
        <span> · {card.provider}</span>
      </strong>
      <span className={styles.modelState}>
        {badge === undefined ? null : <Icon name={badge.icon} size={11} />}
        {badge?.word ?? BALCONY_TEXT.MODELS_LOADING}
      </span>
      <span className={styles.modelTag}>{OFFICE_TEXT.MODEL_TAG}</span>
    </li>
  );
}

// O cantinho do café e a sala de vidro das equipes de modelo (◆): cada uma com a inicial, a palavra do estado e a palavra MODELO.
export function OfficeCorners(): ReactElement {
  const view = useModelTeamsView();
  return (
    <>
      <div className={styles.coffee}>
        <span className={styles.coffeeMachine} />
        <span>{OFFICE_TEXT.COFFEE}</span>
      </div>
      <div className={styles.models}>
        <p className={styles.modelsHead}>
          <span aria-hidden="true">{BALCONY_TEXT.KIND_MODEL_MARK}</span> {OFFICE_TEXT.MODELS_ROOM}
        </p>
        <ul className={styles.modelList}>
          {view.teams.map((card) => (
            <TeamCard key={card.key} card={card} />
          ))}
        </ul>
      </div>
    </>
  );
}
