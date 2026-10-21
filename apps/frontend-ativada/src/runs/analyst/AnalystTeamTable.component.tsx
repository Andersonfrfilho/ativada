// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Term } from '../../glossary/Term.component.js';
import { StatusChip } from '../live-tracking/StatusChip.component.js';
import { VOTE_LOOK } from '../team-room/team-room-view.js';
import type { VoteKind } from '../team-room/team-room.types.js';
import { ANALYST_TEXT, VERDICT_CHIP } from './analyst.constant.js';
import styles from './Analyst.module.css';
import { toSentence } from './analyst-text.js';
import type { AnalystSpecialist } from './analyst.validation.js';

export function voteKindOf(specialist: AnalystSpecialist): VoteKind {
  if (specialist.isUnread || specialist.vote === null) return 'unread';
  if (specialist.vote === 1) return 'favor';
  return specialist.vote === -1 ? 'against' : 'neutral';
}

function SpecialistRow({ specialist }: { readonly specialist: AnalystSpecialist }): ReactElement {
  const vote = VOTE_LOOK[voteKindOf(specialist)];
  const verdict = VERDICT_CHIP[specialist.verdict];
  return (
    <tr className={specialist.verdict === 'above' ? undefined : styles.quiet}>
      <td className={styles.nameCell}>
        <span className={styles.specialistName}>
          <strong>{specialist.label}</strong>
          {specialist.motive === null ? null : (
            <span className={styles.motive}>{toSentence(specialist.motive)}</span>
          )}
        </span>
      </td>
      <td>
        <StatusChip tone={vote.tone} icon={vote.icon}>
          {specialist.voteLabel}
        </StatusChip>
      </td>
      <td className={styles.num}>
        <span className={styles.cellLabel}>Acerto</span>
        {specialist.accuracyText}
      </td>
      <td>
        <StatusChip tone={verdict.tone} icon={verdict.icon}>
          {specialist.verdictLabel}
        </StatusChip>
      </td>
      <td className={styles.num}>
        <span className={styles.cellLabel}>Peso</span>
        {specialist.weightText}
      </td>
    </tr>
  );
}

function TeamNote(): ReactElement {
  return (
    <p className={styles.motive}>
      Cada <Term term="specialist">especialista</Term> vota a favor, contra ou fica neutro. O{' '}
      <Term term="auditor">auditor</Term> confere os acertos dos últimos 30 dias contra a{' '}
      <Term term="coinFlip">moeda ao ar</Term>, com{' '}
      <Term term="confidenceInterval">intervalo de confiança</Term>; só quem provou valor tem peso.
    </p>
  );
}

function TeamHead(): ReactElement {
  return (
    <thead>
      <tr>
        <th scope="col">Especialista</th>
        <th scope="col">Voto</th>
        <th scope="col">Acerto</th>
        <th scope="col">
          <Term term="auditor">Auditor</Term>
        </th>
        <th scope="col">Peso</th>
      </tr>
    </thead>
  );
}

// Os especialistas e a tendência da própria estratégia: voto, acerto contra a moeda ao ar, situação que o auditor deu e peso.
export function AnalystTeamTable({
  specialists,
}: {
  readonly specialists: readonly AnalystSpecialist[];
}): ReactElement {
  return (
    <section className={styles.section} aria-label={ANALYST_TEXT.TEAM_TITLE}>
      <h3 className={styles.sectionTitle}>
        <Term term="specialist">{ANALYST_TEXT.TEAM_TITLE}</Term>
      </h3>
      <TeamNote />
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className={styles.hiddenCaption}>
            Especialistas, voto, acerto, situação dada pelo auditor e peso
          </caption>
          <TeamHead />
          <tbody>
            {specialists.map((specialist) => (
              <SpecialistRow key={specialist.key} specialist={specialist} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
