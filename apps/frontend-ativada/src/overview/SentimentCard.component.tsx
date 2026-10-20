// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { ApiError } from '../http/api.error.js';
import { formatDate } from '../format/format.js';
import { Card } from '../layout/Card.component.js';
import controls from '../styles/Controls.module.css';
import styles from './Overview.module.css';
import {
  EXTERNAL_LINK_REL,
  FEAR_GREED_CREDIT_TEXT,
  FEAR_GREED_CREDIT_URL,
} from './overview.constant.js';
import { useSentimentQuery } from './sentiment.query.js';

export const CLASSIFICATION_TEXT: Readonly<Record<string, string>> = {
  'Extreme Fear': 'Medo extremo',
  Fear: 'Medo',
  Neutral: 'Neutro',
  Greed: 'Ganância',
  'Extreme Greed': 'Ganância extrema',
};

type MissingState = {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: Error | null;
};

// 404 é "ainda não coletado"; qualquer outra falha (rede, 5xx, resposta fora do esquema) é "não deu para ler".
function describeMissing(query: MissingState): string {
  if (query.isPending) return 'Carregando…';
  const isNotCollected = query.error instanceof ApiError && query.error.status === 404;
  return query.isError && !isNotCollected
    ? 'Não foi possível ler o índice agora.'
    : 'O índice ainda não foi coletado.';
}

// Onde o índice aparece, o crédito da alternative.me e o link vão junto (RF01, plan D14); sem valor, o crédito fica.
export function SentimentCard(): ReactElement {
  const sentiment = useSentimentQuery();
  const data = sentiment.data;
  const classification = data?.classification;
  return (
    <Card title="Sentimento do mercado">
      {data === undefined ? (
        <p className={controls.muted}>{describeMissing(sentiment)}</p>
      ) : (
        <p>
          <span className={styles.bigNumber}>{data.fearGreed}</span>{' '}
          <span className={styles.state}>
            {classification === null || classification === undefined
              ? ''
              : (CLASSIFICATION_TEXT[classification] ?? classification)}
          </span>{' '}
          <span className={controls.muted}>
            em {formatDate(Date.parse(`${data.date}T00:00:00Z`))}
          </span>
        </p>
      )}
      <p className={controls.muted}>
        <a
          href={data?.source.url ?? FEAR_GREED_CREDIT_URL}
          target="_blank"
          rel={EXTERNAL_LINK_REL}
          className={controls.textLink}
        >
          {data?.source.creditText ?? FEAR_GREED_CREDIT_TEXT}
        </a>
      </p>
    </Card>
  );
}
