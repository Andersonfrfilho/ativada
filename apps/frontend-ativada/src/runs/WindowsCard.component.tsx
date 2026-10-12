// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { formatDate } from '../format/format.js';
import { Card } from '../layout/Card.component.js';
import styles from './Runs.module.css';
import { useWindowsQuery } from './runs.query.js';

const STATUS_TEXT: Readonly<Record<string, string>> = {
  ok: 'ok',
  no_eligible_parameters: 'sem parâmetros elegíveis',
};

export type WindowsCardProps = { readonly runId: string };

export function WindowsCard({ runId }: WindowsCardProps): ReactElement {
  const windows = useWindowsQuery(runId, true);
  return (
    <Card title="Janelas">
      {windows.data === undefined ? (
        <p>{windows.isError ? 'Não foi possível carregar as janelas.' : 'Carregando…'}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Janela</th>
                <th>Teste</th>
                <th>Combinações elegíveis</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {windows.data.map((window) => (
                <tr key={window.windowIndex}>
                  <td>{window.windowIndex + 1}</td>
                  <td>
                    {formatDate(window.testStart)} a {formatDate(window.testEnd)}
                  </td>
                  <td className={styles.num}>{window.eligibleCombinations}</td>
                  <td>{STATUS_TEXT[window.status] ?? window.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
