// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { Icon } from '../layout/Icon.component.js';
import styles from './Notices.module.css';
import type { Notice } from './notice.validation.js';
import { describeNoticePair, describeWhen, fillTimeTokens } from './notice-text.js';
import { buildChartLink, describeTone } from './notice-tone.js';
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

// Um item da gaveta: o mesmo desenho do aviso, o detalhe (motivo, "vai cancelar?") recolhido e "Ver no gráfico".
export function NoticeItem({ notice }: { readonly notice: Notice }): ReactElement {
  const center = useNoticeCenter();
  const tone = describeTone(notice);
  const link = buildChartLink(notice);
  const isUnread = Date.parse(notice.occurredAt) > center.preferences.readThrough;
  const detail =
    notice.detail === null ? null : fillTimeTokens(notice.detail, notice, center.timeZone);
  return (
    <li className={`${styles['item']} ${styles[tone.tone]} ${isUnread ? styles['unread'] : ''}`}>
      <span className={styles['itemIcon']}>
        <Icon name={tone.icon} size={20} />
      </span>
      <div>
        <ItemTop notice={notice} isUnread={isUnread} />
        <p className={styles['pair']}>{describeNoticePair(notice)}</p>
        <p className={styles['detail']}>
          {fillTimeTokens(notice.message, notice, center.timeZone)}
        </p>
        {detail === null ? null : (
          <details className={styles['disclosure']}>
            <summary>Ver detalhe</summary>
            <p className={styles['detail']}>{detail}</p>
          </details>
        )}
        {link === undefined ? null : (
          <Link className={styles['action']} to={link} onClick={center.closeDrawer}>
            Ver no gráfico
          </Link>
        )}
      </div>
    </li>
  );
}
