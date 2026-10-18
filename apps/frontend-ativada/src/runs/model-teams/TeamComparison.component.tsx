// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useId, useState, type ReactElement } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { formatTimeInZone } from '../../format/zoned-time.js';
import controls from '../../styles/Controls.module.css';
import { MODEL_TEAM_KEYS, MODEL_TEAM_VISUAL } from './model-teams.constant.js';
import { useComparisonQuery, useRunModelTeamsQuery } from './model-teams.query.js';
import type { ComparisonItem } from './model-teams.validation.js';
import {
  COMPARE_TEXT,
  describeRuleCell,
  describeTeamCell,
  markOf,
  NEXT_WORD,
  RULE_COLUMNS,
  type Cell,
} from './compare-text.js';
import styles from './TeamComparison.module.css';

function CellView({ cell }: { readonly cell: Cell }): ReactElement {
  const mark = markOf(cell.isHit);
  return (
    <td>
      {cell.word}
      {mark === undefined ? null : (
        <span className={styles.mark} data-hit={cell.isHit}>
          {' '}
          <span aria-hidden="true">{mark.symbol}</span>
          <span className={styles.srOnly}>{mark.word}</span>
        </span>
      )}
    </td>
  );
}

function Row({
  item,
  timeZone,
}: {
  readonly item: ComparisonItem;
  readonly timeZone: string;
}): ReactElement {
  return (
    <tr>
      <th scope="row">{formatTimeInZone(item.closedAt, timeZone)}</th>
      {RULE_COLUMNS.map((rule) => (
        <CellView key={rule.key} cell={describeRuleCell(item, rule.key)} />
      ))}
      {MODEL_TEAM_KEYS.map((key) => (
        <CellView key={key} cell={describeTeamCell(item, key)} />
      ))}
      <td>{NEXT_WORD[item.next]}</td>
    </tr>
  );
}

function Header(): ReactElement {
  return (
    <thead>
      <tr>
        <th scope="col">Vela fechou às</th>
        {RULE_COLUMNS.map((rule) => (
          <th key={rule.key} scope="col">
            <span aria-hidden="true">●</span> {rule.label}
          </th>
        ))}
        {MODEL_TEAM_KEYS.map((key) => (
          <th key={key} scope="col">
            <span aria-hidden="true">◆</span> {MODEL_TEAM_VISUAL[key].name}
          </th>
        ))}
        <th scope="col">A vela seguinte</th>
      </tr>
    </thead>
  );
}

function Body({ runId }: { readonly runId: string }): ReactElement {
  const timeZone = useUserTimeZone();
  const query = useComparisonQuery(runId, true);
  const state = useRunModelTeamsQuery(runId, true).data;
  if (query.isError)
    return (
      <p role="alert" className={controls.error}>
        {COMPARE_TEXT.ERROR}
      </p>
    );
  if (query.data === undefined) return <p className={controls.muted}>{COMPARE_TEXT.LOADING}</p>;
  const items = query.data.pages.flatMap((page) => page.items);
  if (items.length === 0) return <p className={controls.muted}>{COMPARE_TEXT.EMPTY}</p>;
  return (
    <>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <caption className={styles.srOnly}>{COMPARE_TEXT.TITLE}</caption>
          <Header />
          <tbody>
            {items.map((item) => (
              <Row key={item.candleTime} item={item} timeZone={timeZone} />
            ))}
          </tbody>
        </table>
      </div>
      {query.hasNextPage ? (
        <button
          type="button"
          className={controls.button}
          onClick={() => void query.fetchNextPage()}
        >
          {COMPARE_TEXT.MORE}
        </button>
      ) : null}
      <p className={controls.muted}>{state?.comparisonNotice ?? COMPARE_TEXT.NOTICE}</p>
    </>
  );
}

// "Equipes × regras" (RF21): recolhível; só consulta quando aberto. Compara o acerto do LADO da vela seguinte (✓/✗), não o lucro.
export function TeamComparison({ runId }: { readonly runId: string }): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const bodyId = useId();
  return (
    <details
      className={styles.card}
      open={isOpen}
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className={styles.summary} aria-controls={bodyId}>
        <span aria-hidden="true">◆</span> {COMPARE_TEXT.TITLE}
      </summary>
      <div id={bodyId} className={styles.body}>
        <p className={controls.muted}>{COMPARE_TEXT.HINT}</p>
        {isOpen ? <Body runId={runId} /> : null}
      </div>
    </details>
  );
}
