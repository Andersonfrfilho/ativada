// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { Card } from '../../layout/Card.component.js';
import { useClock } from '../../live/useClock.hook.js';
import controls from '../../styles/Controls.module.css';
import { formatClosingMoment } from '../live-tracking/decision-text.js';
import styles from './Analyst.module.css';
import { ANALYST_TEXT } from './analyst.constant.js';
import { useAnalystDecisionsQuery, useAnalystQuery } from './analyst.query.js';
import type { AnalystDecision } from './analyst.validation.js';
import { PostureChip } from './PostureChip.component.js';

const CLOCK_MILLISECONDS = 60_000;

function HistoryItem({ decision }: { readonly decision: AnalystDecision }): ReactElement {
  const timeZone = useUserTimeZone();
  const now = useClock(CLOCK_MILLISECONDS);
  const closedText = formatClosingMoment(decision.closedAt, { now, timeZone });
  return (
    <li className={styles.historyItem}>
      <div className={styles.historyHead}>
        <PostureChip decision={decision} />
        <strong>{closedText}</strong>
      </div>
      <p className={styles.historyText}>
        {decision.status === 'decided' ? decision.reasonMessage : decision.message}
      </p>
    </li>
  );
}

function HistoryList({
  decisions,
}: {
  readonly decisions: readonly AnalystDecision[];
}): ReactElement {
  return (
    <ol
      className={styles.history}
      aria-label="Decisões do analista, da mais recente para a mais antiga"
    >
      {decisions.map((decision) => (
        <HistoryItem key={decision.candleTime} decision={decision} />
      ))}
    </ol>
  );
}

function HistoryBody({ runId }: { readonly runId: string }): ReactElement {
  const query = useAnalystDecisionsQuery(runId, true);
  const decisions = query.data?.pages.flatMap((page) => page.items) ?? [];
  if (query.data === undefined) {
    return query.isError ? (
      <p className={controls.error} role="alert">
        {ANALYST_TEXT.HISTORY_ERROR}
      </p>
    ) : (
      <p className={controls.muted} role="status">
        {ANALYST_TEXT.HISTORY_LOADING}
      </p>
    );
  }
  return (
    <>
      {decisions.length === 0 ? (
        <p className={controls.muted}>{ANALYST_TEXT.HISTORY_EMPTY}</p>
      ) : (
        <HistoryList decisions={decisions} />
      )}
      {query.hasNextPage ? (
        <button
          type="button"
          className={styles.more}
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {ANALYST_TEXT.MORE_OLDER}
        </button>
      ) : null}
    </>
  );
}

// "Decisões do analista": uma linha por vela, da mais nova à mais antiga, com "Ver decisões anteriores" por cursor.
export function AnalystHistory({ runId }: { readonly runId: string }): ReactElement | null {
  const snapshot = useAnalystQuery(runId).data;
  if (snapshot === undefined || !snapshot.isEnabled) return null;
  return (
    <Card title={ANALYST_TEXT.HISTORY_TITLE} icon="list">
      <HistoryBody runId={runId} />
    </Card>
  );
}
