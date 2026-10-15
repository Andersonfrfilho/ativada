// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatDecimalText } from '../../format/decimal.js';
import { Icon, type IconName } from '../../layout/Icon.component.js';
import styles from './LiveTracking.module.css';

const WEIGHT_FORMAT = { minimumFraction: 0, maximumFraction: 2 } as const;
const MINUS = '−';

export type VoteLabelProps = {
  readonly vote: -1 | 0 | 1;
  readonly weight: string;
  readonly isMissing: boolean;
};

type VoteLook = {
  readonly icon: IconName;
  readonly className: string | undefined;
  readonly text: string;
};

// Voto nunca é só cor: sinal, palavra ("a favor", "contra", "neutra") e ícone.
function lookOf({ vote, weight, isMissing }: VoteLabelProps): VoteLook {
  const amount = formatDecimalText(weight, WEIGHT_FORMAT);
  if (isMissing) return { icon: 'equal', className: styles.voteNeutral, text: 'sem dado' };
  if (vote === 1)
    return { icon: 'arrowUp', className: styles.voteFavor, text: `+${amount} a favor` };
  if (vote === -1) {
    return { icon: 'arrowDown', className: styles.voteAgainst, text: `${MINUS}${amount} contra` };
  }
  return { icon: 'equal', className: styles.voteNeutral, text: '0 neutra' };
}

export function VoteLabel(props: VoteLabelProps): ReactElement {
  const look = lookOf(props);
  return (
    <span className={`${styles.vote} ${look.className ?? ''}`}>
      <Icon name={look.icon} size={14} />
      {look.text}
    </span>
  );
}
