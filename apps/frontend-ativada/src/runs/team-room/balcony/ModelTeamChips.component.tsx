// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, type ReactElement } from 'react';

import { Icon } from '../../../layout/Icon.component.js';
import { ModelTeamSheet } from '../../model-teams/ModelTeamSheet.component.js';
import { OnDemandButton } from '../../model-teams/OnDemandButton.component.js';
import {
  useModelTeamsView,
  type ModelTeamsView,
  type TeamCardModel,
} from '../../model-teams/useModelTeamsView.hook.js';
import styles from './Balcony.module.css';
import { BALCONY_TEXT } from './balcony.constant.js';
import { useBadgeSheet } from './useBadgeSheet.hook.js';

const LOADING_WORD = BALCONY_TEXT.MODELS_LOADING;

function labelOf(card: TeamCardModel): string {
  const word = card.badge?.word ?? LOADING_WORD;
  return `${card.name}, equipe de modelo ${card.provider}, ${word}. Ver a ficha`;
}

function ChipFace({ card }: { readonly card: TeamCardModel }): ReactElement {
  const { badge } = card;
  return (
    <>
      <span className={styles.diamond} aria-hidden="true">
        <span className={styles.diamondLetter}>{card.initial}</span>
      </span>
      <span className={styles.modelText}>
        <strong>{card.name}</strong>
        <span className={styles.modelState}>
          {badge === undefined ? null : <Icon name={badge.icon} size={12} />}
          {badge?.word ?? LOADING_WORD}
        </span>
      </span>
    </>
  );
}

function ModelChip({
  card,
  view,
}: {
  readonly card: TeamCardModel;
  readonly view: ModelTeamsView;
}): ReactElement {
  const sheetId = useId();
  const sheet = useBadgeSheet();
  return (
    <li className={styles.modelItem}>
      <div ref={sheet.rootRef} className={styles.modelRoot}>
        <button
          ref={sheet.buttonRef}
          type="button"
          className={styles.modelButton}
          data-team={card.key}
          aria-expanded={sheet.isOpen}
          aria-controls={sheetId}
          aria-label={labelOf(card)}
          onClick={sheet.toggle}
        >
          <ChipFace card={card} />
        </button>
        <ModelTeamSheet card={card} run={view.run} id={sheetId} isOpen={sheet.isOpen}>
          <OnDemandButton card={card} view={view} />
        </ModelTeamSheet>
      </div>
    </li>
  );
}

// No celular as três viram um chip só, "◆ 3 equipes", com as três fichas empilhadas.
function ModelsSummary({ view }: { readonly view: ModelTeamsView }): ReactElement {
  const sheetId = useId();
  const sheet = useBadgeSheet();
  return (
    <div ref={sheet.rootRef} className={styles.modelsSummary}>
      <button
        ref={sheet.buttonRef}
        type="button"
        className={styles.modelButton}
        aria-expanded={sheet.isOpen}
        aria-controls={sheetId}
        onClick={sheet.toggle}
      >
        <span aria-hidden="true">{BALCONY_TEXT.KIND_MODEL_MARK}</span> {view.teams.length} equipes
      </button>
      <div
        id={sheetId}
        role="group"
        aria-label="Equipes de modelo"
        hidden={!sheet.isOpen}
        className={styles.sheet}
      >
        {view.teams.map((card) => (
          <ModelTeamSheet
            key={card.key}
            card={card}
            run={view.run}
            id={`${sheetId}-${card.key}`}
            isOpen
            isInline
          >
            <OnDemandButton card={card} view={view} />
          </ModelTeamSheet>
        ))}
      </div>
    </div>
  );
}

function NoTeams({ view }: { readonly view: ModelTeamsView }): ReactElement | null {
  if (view.status === 'absent')
    return <p className={styles.modelsNote}>{BALCONY_TEXT.MODELS_ONLY_LIVE}</p>;
  if (view.status === 'error')
    return <p className={styles.modelsNote}>{BALCONY_TEXT.MODELS_ERROR}</p>;
  return null;
}

// As equipes de MODELO (◆): moldura tracejada, losango com a INICIAL, a palavra do estado e uma marca de forma por equipe.
export function ModelTeamChips(): ReactElement {
  const view = useModelTeamsView();
  return (
    <>
      <ModelsSummary view={view} />
      <div className={styles.models}>
        <p className={styles.modelsHead}>
          <span aria-hidden="true">{BALCONY_TEXT.KIND_MODEL_MARK}</span> {BALCONY_TEXT.MODELS_TITLE}
        </p>
        <NoTeams view={view} />
        <p className={styles.modelsNote}>{BALCONY_TEXT.MODELS_NOTE}</p>
        <ul className={styles.modelList}>
          {view.teams.map((card) => (
            <ModelChip key={card.key} card={card} view={view} />
          ))}
        </ul>
      </div>
    </>
  );
}
