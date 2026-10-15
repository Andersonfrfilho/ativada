// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import styles from './ProjectionCards.module.css';
import { ProjectionHistoryCard } from './ProjectionHistoryCard.component.js';
import { ProjectionSourceCard } from './ProjectionSourceCard.component.js';

export type ProjectionCardsProps = {
  readonly runId: string;
  // A simulação ao vivo é a única com "próxima vela"; backtest e walk-forward só têm o histórico de acertos (D15).
  readonly isLive: boolean;
};

// Os dois cartões abaixo do gráfico: de onde vem a previsão (ao vivo) e o histórico de acertos (qualquer execução).
export function ProjectionCards({ runId, isLive }: ProjectionCardsProps): ReactElement {
  if (!isLive) return <ProjectionHistoryCard runId={runId} />;
  return (
    <div className={styles.pair}>
      <ProjectionSourceCard runId={runId} />
      <ProjectionHistoryCard runId={runId} />
    </div>
  );
}
