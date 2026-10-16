// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Term } from '../../glossary/Term.component.js';
import { Card } from '../../layout/Card.component.js';
import { Icon } from '../../layout/Icon.component.js';
import styles from './TeamRoomCard.module.css';
import { TeamRoomControls, type TeamRoomControlsProps } from './TeamRoomControls.component.js';
import { TeamRoomLines } from './TeamRoomLines.component.js';
import { TeamRoomNavigator, type TeamRoomNavigatorProps } from './TeamRoomNavigator.component.js';
import { TeamRoomStage } from './TeamRoomStage.component.js';
import { TEAM_LEGEND, TEAM_ROOM_TEXT } from './team-room.constant.js';
import type { AuditorView, TeamRoomView } from './team-room.types.js';

export type TeamRoomContent = {
  readonly view: TeamRoomView;
  readonly auditor: AuditorView | undefined;
  readonly closedText: string;
  // Uma frase de interface quando a simulação não está rodando (a sala mostra a última vela decidida).
  readonly notice: string | undefined;
};

export type TeamRoomMotion = {
  readonly step: number;
  readonly isRinging: boolean;
  readonly isAnnounced: boolean;
};

export type TeamRoomCardProps = {
  readonly content: TeamRoomContent;
  readonly motion: TeamRoomMotion;
  readonly controls: TeamRoomControlsProps;
  readonly navigator: TeamRoomNavigatorProps;
  // Layout "Sala com o gráfico": o gráfico vira o monitor da sala (o mesmo cartão "Preço e operações").
  readonly monitor: ReactElement | undefined;
};

function Subtitle(): ReactElement {
  return (
    <p className={styles.notice}>
      <span>
        Cada <Term term="specialist">especialista</Term> da <Term term="team">equipe</Term> diz o
        que votou; o resumo mostra a decisão do placar; o <Term term="auditor">auditor</Term>{' '}
        confere os acertos contra a <Term term="coinFlip">moeda ao ar</Term>.
      </span>
    </p>
  );
}

function Legend(): ReactElement {
  return (
    <ul className={styles.legend} aria-label="Legenda da sala">
      {TEAM_LEGEND.map((item) => (
        <li key={item.word}>
          <strong>{item.word}</strong> = {item.meaning}
        </li>
      ))}
    </ul>
  );
}

function RoomBody({ content, motion, navigator, monitor }: TeamRoomCardProps): ReactElement {
  return (
    <>
      <Subtitle />
      {content.notice === undefined ? null : (
        <p className={styles.notice}>
          <Icon name="info" size={16} />
          {content.notice}
        </p>
      )}
      <TeamRoomNavigator {...navigator} />
      {monitor === undefined ? null : (
        <div className={styles.monitor}>
          <p className={styles.monitorLabel}>{TEAM_ROOM_TEXT.MONITOR}</p>
          {monitor}
        </div>
      )}
      <TeamRoomStage
        view={content.view}
        auditor={content.auditor}
        step={motion.step}
        isRinging={motion.isRinging}
      />
      <Legend />
      <TeamRoomLines
        view={content.view}
        auditor={content.auditor}
        closedText={content.closedText}
        isAnnounced={motion.isAnnounced}
      />
      <p className={styles.disclaimer}>{TEAM_ROOM_TEXT.DISCLAIMER}</p>
    </>
  );
}

// O cartão "Sala da equipe": recolhível, com a alternância de layout; recolhido, o monitor segue visível logo abaixo.
export function TeamRoomCard(props: TeamRoomCardProps): ReactElement {
  const { isCollapsed } = props.controls.preference;
  return (
    <>
      <Card
        title={TEAM_ROOM_TEXT.TITLE}
        icon="team"
        aside={<TeamRoomControls {...props.controls} />}
      >
        {isCollapsed ? null : <RoomBody {...props} />}
      </Card>
      {isCollapsed ? props.monitor : null}
    </>
  );
}
