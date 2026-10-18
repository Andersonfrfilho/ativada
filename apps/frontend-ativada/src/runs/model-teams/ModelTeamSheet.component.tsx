// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement, ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { formatTimeInZone } from '../../format/zoned-time.js';
import { GLOSSARY_TERM } from '../../glossary/glossary.constant.js';
import { Term } from '../../glossary/Term.component.js';
import { Icon } from '../../layout/Icon.component.js';
import type { Recommendation, RunModelTeams, TeamState } from './model-teams.validation.js';
import styles from './ModelTeamSheet.module.css';
import type { TeamBadge } from './team-badge.js';
import { describeLevels } from './team-sheet-text.js';
import { TeamSheetNumbers } from './TeamSheetNumbers.component.js';
import { TeamSheetRoles } from './TeamSheetRoles.component.js';
import type { TeamCardModel } from './useModelTeamsView.hook.js';

export const MODEL_SHEET_TEXT = {
  PREFERENCES_LINK: 'Ligar/desligar nas preferências',
  NO_READING: 'Última recomendação: ainda sem leitura desta equipe.',
  NO_STATE: 'Sem notícia desta equipe agora: ela só existe nas simulações ao vivo.',
} as const;

function LastRecommendation({
  decided,
  timeZone,
}: {
  readonly decided: Recommendation | undefined;
  readonly timeZone: string;
}): ReactElement {
  if (decided === undefined) return <li>{MODEL_SHEET_TEXT.NO_READING}</li>;
  return (
    <li>
      Última recomendação: <strong>{decided.actionLabel ?? 'esperar'}</strong> (vela das{' '}
      {formatTimeInZone(decided.closedAt, timeZone)})
      {decided.levels === null ? null : <> · {describeLevels(decided.levels)}</>}
      {decided.confidence === null ? null : <> · certeza declarada {decided.confidence} de 100</>}
    </li>
  );
}

const PREFERENCES_PATH = '/conta#equipes';

// Dentro do app é navegação do roteador; fora dele (uma peça montada sozinha) é um link comum.
function PreferencesLink(): ReactElement {
  const isInRouter = useInRouterContext();
  return isInRouter ? (
    <Link className={styles.link} to={PREFERENCES_PATH}>
      {MODEL_SHEET_TEXT.PREFERENCES_LINK}
    </Link>
  ) : (
    <a className={styles.link} href={PREFERENCES_PATH}>
      {MODEL_SHEET_TEXT.PREFERENCES_LINK}
    </a>
  );
}

type BodyProps = {
  readonly state: TeamState;
  readonly badge: TeamBadge;
  readonly run: RunModelTeams;
  readonly children: ReactNode;
};

function SheetBody({ state, badge, run, children }: BodyProps): ReactElement {
  const timeZone = useUserTimeZone();
  const decided = state.recent.find((item) => item.status === 'decided');
  return (
    <>
      <ul>
        <li className={styles.state}>
          Estado: <Icon name={badge.icon} size={14} /> {badge.word}
        </li>
        <li>
          Modelo: {state.team.modelFamily} · onde roda: {state.team.cloudLabel}
        </li>
        <LastRecommendation decided={decided} timeZone={timeZone} />
      </ul>
      {decided === undefined ? null : <TeamSheetRoles recommendation={decided} />}
      <TeamSheetNumbers state={state} costNotice={run.costNotice} />
      {decided === undefined ? null : <p className={styles.footer}>{decided.generatedBy}</p>}
      <p className={styles.footer}>{run.notice}</p>
      {children}
      <PreferencesLink />
    </>
  );
}

export type ModelTeamSheetProps = {
  readonly card: TeamCardModel;
  readonly run: RunModelTeams | undefined;
  readonly id: string;
  readonly isOpen: boolean;
  // Dentro de outra ficha (celular): sem balão próprio.
  readonly isInline?: boolean;
  // Lugar do botão "Pedir opinião agora".
  readonly children?: ReactNode;
};

// A ficha da equipe (RF19): modelo e nuvem, estado, última recomendação com os preços, os três papéis, acertos, custo e falhas.
export function ModelTeamSheet({
  card,
  run,
  id,
  isOpen,
  isInline = false,
  children,
}: ModelTeamSheetProps): ReactElement {
  const { state, badge } = card;
  return (
    <div
      id={id}
      role="group"
      aria-label={`Ficha de ${card.name}`}
      hidden={!isOpen}
      className={isInline ? `${styles.sheet} ${styles.inline}` : styles.sheet}
    >
      <strong className={styles.head}>
        <span aria-hidden="true">◆</span>{' '}
        <Term term={GLOSSARY_TERM.MODEL_TEAM}>{`MODELO · ${card.name} (${card.provider})`}</Term>
      </strong>
      {state === undefined || run === undefined || badge === undefined ? (
        <p>{MODEL_SHEET_TEXT.NO_STATE}</p>
      ) : (
        <SheetBody state={state} badge={badge} run={run}>
          {children}
        </SheetBody>
      )}
    </div>
  );
}
