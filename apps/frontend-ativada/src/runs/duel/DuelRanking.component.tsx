// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { GLOSSARY_TERM } from '../../glossary/glossary.constant.js';
import { Term } from '../../glossary/Term.component.js';
import type { Duel } from './duel.validation.js';
import { buildRanking, type RankingLine } from './duel-ranking.js';
import styles from './Duel.module.css';

function Accuracy({ line }: { readonly line: RankingLine }): ReactElement {
  if (line.accuracy === undefined) return <>—</>;
  return (
    <>
      {line.accuracy.headline}
      <span className={styles.small}>{line.accuracy.verdict}</span>
      {line.accuracy.range === undefined ? null : (
        <span className={styles.small}>{line.accuracy.range}</span>
      )}
    </>
  );
}

function Row({ line }: { readonly line: RankingLine }): ReactElement {
  return (
    <tr>
      <th scope="row">
        <span className={styles.position}>{line.position}º</span> {line.label}
        <span className={styles.small}>
          <Link className={styles.link} to={`/backtests/${line.runId}`}>
            Ver a simulação
          </Link>
        </span>
      </th>
      <td>{line.returnText}</td>
      <td>{line.drawdownText}</td>
      <td>{line.trades}</td>
      <td>
        <Accuracy line={line} />
      </td>
      <td>{line.cost}</td>
    </tr>
  );
}

// A tabela de ranking (RF21): o acerto de lado com Wilson é a régua estatística; o retorno só informa e vem rotulado.
export function DuelRanking({ duel }: { readonly duel: Duel }): ReactElement {
  const lines = buildRanking(duel);
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <caption className={styles.srOnly}>Ranking do duelo</caption>
        <thead>
          <tr>
            <th scope="col">Execução</th>
            <th scope="col">Retorno</th>
            <th scope="col">Perda máxima</th>
            <th scope="col">Operações</th>
            <th scope="col">
              <Term term={GLOSSARY_TERM.SIDE_HIT_RATE}>Acerto de lado</Term> (Wilson)
            </th>
            <th scope="col">
              <Term term={GLOSSARY_TERM.ESTIMATED_COST}>Custo de API</Term>
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <Row key={line.runId} line={line} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
