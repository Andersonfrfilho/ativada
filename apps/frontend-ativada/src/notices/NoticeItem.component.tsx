// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { MouseEvent, ReactElement } from 'react';
import { Link } from 'react-router';

import { Icon } from '../layout/Icon.component.js';
import styles from './Notices.module.css';
import type { Notice } from './notice.validation.js';
import { describeNoticePair, describeWhen, fillTimeTokens } from './notice-text.js';
import { isBodyClick, isPlainClick } from './notice-click.js';
import { buildChartLink, buildNoticeTarget, describeTone } from './notice-tone.js';
import { ManualTradePanel } from './ManualTradePanel.component.js';
import { buildNoticeRuler, SignalCard } from './SignalCard.component.js';
import { useNoticeCenter } from './useNoticeCenter.hook.js';

function ItemTop(props: { readonly notice: Notice; readonly isUnread: boolean }): ReactElement {
  const { timeZone, now } = useNoticeCenter();
  const when = describeWhen({ occurredAt: props.notice.occurredAt, now, timeZone });
  return (
    <div className={styles['itemTop']}>
      {props.isUnread ? <span className={styles['dot']} aria-hidden="true" /> : null}
      <span className={styles['itemTitle']}>{props.notice.title}</span>
      {props.isUnread ? <span className={styles['newTag']}>Novo</span> : null}
      <span className={styles['itemTime']}>{when}</span>
    </div>
  );
}

// O texto do item: a ficha com a régua para compra executada e venda; a frase simples para os demais.
function ItemSummary({ notice }: { readonly notice: Notice }): ReactElement {
  const { timeZone, now } = useNoticeCenter();
  const ruler = buildNoticeRuler(notice);
  if (ruler !== undefined) {
    return <SignalCard notice={notice} ruler={ruler} now={now} timeZone={timeZone} />;
  }
  return (
    <>
      <p className={styles['pair']}>{describeNoticePair(notice)}</p>
      <p className={styles['detail']}>{fillTimeTokens(notice.message, notice, timeZone)}</p>
    </>
  );
}

function ItemAction({ notice }: { readonly notice: Notice }): ReactElement | null {
  const { openNotice } = useNoticeCenter();
  const target = buildNoticeTarget(notice);
  if (target === undefined) return null;
  function handleClick(event: MouseEvent<HTMLAnchorElement>): void {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    openNotice(notice);
  }
  return (
    <Link className={styles['action']} to={target} onClick={handleClick}>
      {buildChartLink(notice) === undefined ? 'Ver alertas' : 'Ver no gráfico'}
    </Link>
  );
}

// Um item da gaveta: o mesmo desenho do aviso, o detalhe (motivo, "vai cancelar?") recolhido e "Ver no gráfico".
export function NoticeItem({ notice }: { readonly notice: Notice }): ReactElement {
  const center = useNoticeCenter();
  const tone = describeTone(notice);
  const isUnread = Date.parse(notice.occurredAt) > center.preferences.readThrough;
  const detail =
    notice.detail === null ? null : fillTimeTokens(notice.detail, notice, center.timeZone);
  return (
    <li
      className={`${styles['item']} ${styles[tone.tone]} ${isUnread ? styles['unread'] : ''}`}
      onClick={(event) => (isBodyClick(event) ? center.openNotice(notice) : undefined)}
    >
      <span className={styles['itemIcon']}>
        <Icon name={tone.icon} size={20} />
      </span>
      <div>
        <ItemTop notice={notice} isUnread={isUnread} />
        <ItemSummary notice={notice} />
        <ManualTradePanel notice={notice} />
        {detail === null ? null : (
          <details className={styles['disclosure']}>
            <summary>Ver detalhe</summary>
            <p className={styles['detail']}>{detail}</p>
          </details>
        )}
        <ItemAction notice={notice} />
      </div>
    </li>
  );
}
