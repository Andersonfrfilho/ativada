// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { GLOSSARY_TERM } from '../../../glossary/glossary.constant.js';
import { Term } from '../../../glossary/Term.component.js';
import { Icon } from '../../../layout/Icon.component.js';
import { useProjectionsQuery } from '../../candle-chart/candle-chart.query.js';
import { StatusChip } from '../../live-tracking/StatusChip.component.js';
import { VERDICT_LOOK } from '../../projection-cards/projection-verdict.js';
import type { BalconyAgent } from './balcony-agents.js';
import { BALCONY_TEXT } from './balcony.constant.js';
import styles from './Balcony.module.css';
import {
  buildMeasuredRow,
  buildUnmeasuredRow,
  hasCrown,
  rankRows,
  type RankingRow,
} from './ranking-model.js';

function RankRow({
  row,
  position,
}: {
  readonly row: RankingRow;
  readonly position: string;
}): ReactElement {
  const look = row.verdict === undefined ? undefined : VERDICT_LOOK[row.verdict];
  return (
    <tr>
      <td>{position}</td>
      <th scope="row">
        {hasCrown(row) ? <Icon name="crown" size={12} /> : null} {row.name}
      </th>
      <td>
        {row.hitsText} · {row.rateText}
      </td>
      <td>{row.intervalText}</td>
      <td>
        {look === undefined ? (
          '—'
        ) : (
          <StatusChip tone={look.tone} icon={look.icon}>
            {look.word}
          </StatusChip>
        )}
      </td>
      <td>{row.weightText}</td>
    </tr>
  );
}

type RankingProps = { readonly runId: string; readonly agents: readonly BalconyAgent[] };

// O ranking que o servidor sustenta hoje: o acerto do lado do placar contra a moeda ao ar (50%) com o intervalo de Wilson, a coroa só
// para "Acima", e os especialistas sem número (o servidor não mede por especialista) com o peso que a estratégia deu.
export function BoardRanking({ runId, agents }: RankingProps): ReactElement {
  const summary = useProjectionsQuery({ runId }).data?.summary;
  if (summary === undefined) return <p className={styles.boardNote}>{BALCONY_TEXT.MEASURING}</p>;
  const specialists = agents.filter((agent) => agent.placard !== undefined);
  const { ranked, unranked } = rankRows([
    buildMeasuredRow(summary),
    ...specialists.map((agent) => buildUnmeasuredRow(agent.name, agent.placard ?? '—')),
  ]);
  return (
    <div className={styles.rankingBox}>
      <table className={styles.rankingTable}>
        <thead>
          <tr>
            <th>#</th>
            <th>Agente</th>
            <th>Acerto contra 50%</th>
            <th>
              <Term term={GLOSSARY_TERM.CONFIDENCE_INTERVAL}>Wilson</Term>
            </th>
            <th>Veredito</th>
            <th>
              <Term term={GLOSSARY_TERM.WEIGHT}>Peso</Term>
            </th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((row, index) => (
            <RankRow key={row.key} row={row} position={String(index + 1)} />
          ))}
          {unranked.map((row) => (
            <RankRow key={row.key} row={row} position="—" />
          ))}
        </tbody>
      </table>
      <p className={styles.boardNote}>{BALCONY_TEXT.RANKING_UNMEASURED}</p>
      <p className={styles.boardNote}>{BALCONY_TEXT.RANKING_MODELS}</p>
      <p className={styles.boardNote}>{BALCONY_TEXT.RANKING_FOOTER}</p>
    </div>
  );
}
