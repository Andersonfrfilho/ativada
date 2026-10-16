// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ReactElement } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { formatMomentSkippingToday } from '../../format/zoned-moment.js';
import { zoneLabel } from '../../format/zoned-time.js';
import { Card } from '../../layout/Card.component.js';
import { useClock } from '../../live/useClock.hook.js';
import { groupDecisions, mergeDecisions } from './decision-groups.js';
import { DecisionRunGroup } from './DecisionRunGroup.component.js';
import styles from './Decisions.module.css';
import { useDecisionsQuery } from './live-status.query.js';
import type { Decision, LiveStatus } from './live-status.validation.js';
import { DECISIONS_ANCHOR } from './LiveTradesState.component.js';

const CLOCK_MILLISECONDS = 60_000;

const EVERY_TIMEFRAME: Readonly<Record<string, string>> = {
  '15m': 'a cada 15 minutos',
  '1h': 'a cada hora',
  '4h': 'a cada 4 horas',
  '1d': 'a cada dia',
};

export type DecisionsTableProps = { readonly runId: string; readonly status: LiveStatus };

export type OlderDecisions = {
  readonly decisions: readonly Decision[];
  readonly hasMore: boolean;
  readonly isLoading: boolean;
  readonly loadMore: () => void;
};

// O live-status traz as 24 mais novas; as anteriores vêm sob demanda, por cursor, e se juntam sem repetir vela.
export function useOlderDecisions(runId: string, status: LiveStatus): OlderDecisions {
  const [isRequested, setIsRequested] = useState(false);
  const older = useDecisionsQuery(runId, isRequested);
  const olderItems = older.data?.pages.flatMap((page) => page.items) ?? [];
  const hasMore = isRequested ? older.hasNextPage : status.decisions.nextCursor !== null;
  function loadMore(): void {
    if (isRequested) older.fetchNextPage().catch(() => undefined);
    else setIsRequested(true);
  }
  return {
    decisions: mergeDecisions([olderItems, status.decisions.items]),
    hasMore,
    isLoading: isRequested && (older.isPending || older.isFetchingNextPage),
    loadMore,
  };
}

function TableHead(): ReactElement {
  return (
    <thead>
      <tr>
        <th scope="col">Vela fechou</th>
        <th scope="col" className={styles.right}>
          Preço
        </th>
        <th scope="col">Decisão</th>
        <th scope="col">Pontuação</th>
        <th scope="col">Por quê</th>
      </tr>
    </thead>
  );
}

type ListProps = {
  readonly decisions: readonly Decision[];
  readonly timeframe: string;
  readonly now: number;
  readonly timeZone: string;
};

function DecisionsList({ decisions, timeframe, now, timeZone }: ListProps): ReactElement {
  return (
    <table className={styles.table}>
      <caption className={styles.hiddenCaption}>
        Decisões da simulação, da mais recente para a mais antiga
      </caption>
      <TableHead />
      <tbody>
        {groupDecisions(decisions).map((group) => (
          <DecisionRunGroup
            key={group.head.candleTime}
            group={group}
            timeframe={timeframe}
            now={now}
            timeZone={timeZone}
          />
        ))}
      </tbody>
    </table>
  );
}

type FooterProps = {
  readonly count: number;
  readonly nextDecisionAt: number | null;
  readonly now: number;
  readonly timeZone: string;
};

function TableFooter({ count, nextDecisionAt, now, timeZone }: FooterProps): ReactElement {
  return (
    <div className={styles.footer}>
      <span className={styles.muted}>
        {count === 1 ? '1 decisão mostrada' : `${count} decisões mostradas`} · velas seguidas iguais
        ficam agrupadas.
      </span>
      {nextDecisionAt === null ? null : (
        <span className={styles.muted}>
          A próxima linha entra às {formatMomentSkippingToday(nextDecisionAt, { now, timeZone })},
          sozinha.
        </span>
      )}
    </div>
  );
}

// "O que a estratégia decidiu a cada hora" (RF05): uma linha por vela, da mais recente à mais antiga, com os votos sob demanda.
export function DecisionsTable({ runId, status }: DecisionsTableProps): ReactElement {
  const timeZone = useUserTimeZone();
  const now = useClock(CLOCK_MILLISECONDS);
  const { decisions, hasMore, isLoading, loadMore } = useOlderDecisions(runId, status);
  const timeframe = status.run.timeframe;
  return (
    <Card
      id={DECISIONS_ANCHOR}
      title={`O que a estratégia decidiu ${EVERY_TIMEFRAME[timeframe] ?? 'a cada vela'}`}
      icon="list"
      aside={
        <span className={`${styles.muted} ${styles.small}`}>
          mais recente primeiro · {zoneLabel(timeZone, now)}
        </span>
      }
    >
      <DecisionsList decisions={decisions} timeframe={timeframe} now={now} timeZone={timeZone} />
      <TableFooter
        count={decisions.length}
        nextDecisionAt={status.run.nextDecisionAt}
        now={now}
        timeZone={timeZone}
      />
      {hasMore ? (
        <button type="button" className={styles.more} disabled={isLoading} onClick={loadMore}>
          {isLoading ? 'Carregando…' : 'Ver decisões anteriores'}
        </button>
      ) : null}
    </Card>
  );
}
