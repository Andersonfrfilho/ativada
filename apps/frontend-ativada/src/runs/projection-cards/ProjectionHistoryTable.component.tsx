// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ReactElement } from 'react';

import { useUserTimeZone } from '../../account/useUserTimeZone.hook.js';
import { formatPrice } from '../../format/format.js';
import { formatInZone } from '../../format/zoned-time.js';
import { Icon, type IconName } from '../../layout/Icon.component.js';
import controls from '../../styles/Controls.module.css';
import { TIMEFRAME_PHRASE } from '../candle-chart/candle-chart.constant.js';
import { useProjectionsQuery } from '../candle-chart/candle-chart.query.js';
import { SIDE_WORD, STRENGTH_WORD } from '../candle-chart/projection-text.js';
import type { ProjectionItem } from '../candle-chart/projections.validation.js';
import styles from './ProjectionCards.module.css';

type ResultLook = { readonly icon: IconName; readonly word: string; readonly className: string };

const RESULT_LOOK: Readonly<Record<ProjectionItem['result'], ResultLook>> = {
  hit: { icon: 'check', word: 'Acertou', className: styles.hit ?? '' },
  miss: { icon: 'close', word: 'Errou', className: styles.miss ?? '' },
  tie: { icon: 'equal', word: 'Empatou', className: '' },
  no_side: { icon: 'equal', word: 'Sem aposta', className: '' },
  pending: { icon: 'horizons', word: 'Aguardando', className: '' },
  gap: { icon: 'alert', word: 'Sem vela', className: '' },
};

const SIDE_ICON: Readonly<Record<ProjectionItem['side'], IconName>> = {
  buy: 'arrowUp',
  sell: 'arrowDown',
  none: 'equal',
};

function describeBand(isInside: boolean | null): string {
  if (isInside === null) return '';
  return isInside ? ' · na faixa' : ' · fora da faixa';
}

function HistoryRow({
  item,
  timeZone,
}: {
  readonly item: ProjectionItem;
  readonly timeZone: string;
}): ReactElement {
  const result = RESULT_LOOK[item.result];
  const strength = item.strength === null ? '' : ` · ${STRENGTH_WORD[item.strength]}`;
  return (
    <tr>
      <td className={styles.number}>{formatInZone(item.closedAt, timeZone)}</td>
      <td>
        <span className={styles.tag}>
          <Icon name={SIDE_ICON[item.side]} size={14} />
          {SIDE_WORD[item.side]}
          {strength}
        </span>
      </td>
      <td className={`${styles.number} ${styles.right}`}>{formatPrice(item.base)}</td>
      <td className={`${styles.number} ${styles.right}`}>
        {item.nextClose === null ? '—' : formatPrice(item.nextClose)}
      </td>
      <td>
        <span className={`${styles.tag} ${result.className}`}>
          <Icon name={result.icon} size={14} />
          {result.word}
        </span>
        <span className={styles.muted}>{describeBand(item.isInside)}</span>
      </td>
    </tr>
  );
}

type PageProps = { readonly runId: string; readonly cursor: string | undefined };

// Uma página da tabela (24 previsões) e, no fim, o "Ver mais" que pede a seguinte pelo cursor do servidor. A primeira
// página é a mesma consulta do painel da próxima vela: o aviso do stream refaz as duas de uma vez.
function HistoryPage({ runId, cursor }: PageProps): ReactElement | null {
  const timeZone = useUserTimeZone();
  const [isExpanded, setIsExpanded] = useState(false);
  const page = useProjectionsQuery({ runId, ...(cursor === undefined ? {} : { cursor }) });
  if (page.data === undefined) {
    return page.isError ? (
      <tbody>
        <tr>
          <td colSpan={5}>Não foi possível carregar mais previsões.</td>
        </tr>
      </tbody>
    ) : null;
  }
  const next = page.data.nextCursor;
  return (
    <>
      <tbody>
        {page.data.items.map((item) => (
          <HistoryRow key={item.candleTime} item={item} timeZone={timeZone} />
        ))}
        {next === null || isExpanded ? null : (
          <tr>
            <td colSpan={5}>
              <button type="button" className={controls.button} onClick={() => setIsExpanded(true)}>
                Ver mais previsões
              </button>
            </td>
          </tr>
        )}
      </tbody>
      {next !== null && isExpanded ? <HistoryPage runId={runId} cursor={next} /> : null}
    </>
  );
}

export type ProjectionHistoryTableProps = { readonly runId: string; readonly timeframe: string };

// As últimas previsões, da mais nova à mais velha, com a vela, a tendência, a partida, o preço depois e o resultado.
export function ProjectionHistoryTable({
  runId,
  timeframe,
}: ProjectionHistoryTableProps): ReactElement {
  const phrase = TIMEFRAME_PHRASE[timeframe] ?? timeframe;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className={styles.caption}>
          Últimas previsões, da mais nova para a mais velha
        </caption>
        <thead>
          <tr>
            <th scope="col">Vela fechou</th>
            <th scope="col">Tendência</th>
            <th scope="col" className={styles.right}>
              Partida
            </th>
            <th scope="col" className={styles.right}>
              {phrase} depois
            </th>
            <th scope="col">Resultado</th>
          </tr>
        </thead>
        <HistoryPage runId={runId} cursor={undefined} />
      </table>
    </div>
  );
}
