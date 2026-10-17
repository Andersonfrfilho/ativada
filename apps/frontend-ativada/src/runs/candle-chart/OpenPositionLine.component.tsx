// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatPrice } from '../../format/format.js';
import { Term } from '../../glossary/Term.component.js';
import { Icon } from '../../layout/Icon.component.js';
import { useLiveStatusQuery } from '../live-tracking/live-status.query.js';
import styles from './NextCandlePanel.module.css';

export type OpenPositionLineProps = { readonly runId: string };

// Com posição aberta, diz em palavras de leigo quando a simulação vende; sem posição, nada. Os valores vêm do acompanhamento
// ao vivo (a mesma consulta dos níveis do gráfico), sem conta nenhuma no navegador.
export function OpenPositionLine({ runId }: OpenPositionLineProps): ReactElement | null {
  const position = useLiveStatusQuery(runId, true).data?.openPosition;
  if (position === null || position === undefined) return null;
  return (
    <p className={styles.holding}>
      <Icon name="wallet" size={16} />
      <span>
        <strong>Você está comprado:</strong> vende no <Term term="targetPrice">alvo</Term>{' '}
        <span className={styles.number}>{formatPrice(position.targetPrice)}</span>, na{' '}
        <Term term="stopPrice">proteção</Term>{' '}
        <span className={styles.number}>{formatPrice(position.stopPrice)}</span> ou se o{' '}
        <Term term="scoreboard">placar</Term> virar venda.
      </span>
    </p>
  );
}
