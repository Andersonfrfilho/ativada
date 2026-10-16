// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatDecimalText } from '../../format/decimal.js';
import type { Decision, DecisionVote } from './live-status.validation.js';
import styles from './Decisions.module.css';
import { formatScorePoints } from './ScoreboardRuler.component.js';
import { VoteLabel } from './VoteLabel.component.js';

const READING_FORMAT = { minimumFraction: 0, maximumFraction: 4 } as const;
const SINGLE_OUTPUT = 'value';

// O valor que a regra leu naquela vela ("55" ou "macd 0,12 · signal 0,09"); sem leitura, nada.
export function describeReading(reading: DecisionVote['reading']): string | undefined {
  if (reading === null) return undefined;
  const parts = Object.entries(reading).map(([name, value]) => {
    const formatted = formatDecimalText(value, READING_FORMAT);
    return name === SINGLE_OUTPUT ? formatted : `${name} ${formatted}`;
  });
  return parts.length === 0 ? undefined : parts.join(' · ');
}

function VoteItem({ vote }: { readonly vote: DecisionVote }): ReactElement {
  const reading = describeReading(vote.reading);
  return (
    <li>
      {vote.label}: <VoteLabel vote={vote.vote} weight={vote.weight} isMissing={vote.isMissing} />
      {reading === undefined ? null : <span className={styles.muted}> — leitura {reading}</span>}
    </li>
  );
}

function describeRequirement(threshold: string): string {
  const isSell = threshold.startsWith('-');
  return isSell
    ? `a venda pede ${formatScorePoints(threshold, true)} ou menos`
    : `a compra pede ${formatScorePoints(threshold, true)} ou mais`;
}

export type DecisionVotesProps = {
  readonly decision: Decision;
  readonly closedAtText: string;
  readonly id: string;
};

// O detalhe da linha (RF05): cada regra com nome, voto (sinal, palavra e peso) e leitura; o texto do motor fica recolhido.
export function DecisionVotes({ decision, closedAtText, id }: DecisionVotesProps): ReactElement {
  return (
    <tr id={id} className={styles.detailRow}>
      <td colSpan={5}>
        <div className={styles.detail}>
          <strong>
            Votos na vela que fechou {closedAtText} (somam{' '}
            {formatScorePoints(decision.score, false)};{' '}
            {describeRequirement(decision.scoreThreshold)})
          </strong>
          <ul>
            {decision.votes.map((vote) => (
              <VoteItem key={vote.ruleId} vote={vote} />
            ))}
          </ul>
          <details className={styles.technical}>
            <summary className={styles.small}>Detalhe técnico</summary>
            <code className={styles.extraSmall}>{decision.technicalReason}</code>
          </details>
        </div>
      </td>
    </tr>
  );
}
