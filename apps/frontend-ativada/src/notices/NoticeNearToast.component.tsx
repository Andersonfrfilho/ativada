// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { Icon } from '../layout/Icon.component.js';
import styles from './Notices.module.css';
import { TriggerProgress } from './TriggerProgress.component.js';
import { TREND_NOT_PROMISE } from './notice.constant.js';
import { formatTimeInZoneText } from './notice-text.js';
import { formatPriceAtTick } from './symbol-filters.js';
import { ToastCloseButton } from './ToastCloseButton.component.js';
import type { NearTrigger } from './useNearTriggers.hook.js';
import { useNoticeCenter } from './useNoticeCenter.hook.js';

function describeNear(trigger: NearTrigger, closesAt: string): string {
  const limit = formatPriceAtTick(trigger.symbol, trigger.threshold);
  const now = formatPriceAtTick(trigger.symbol, trigger.price);
  const closes = closesAt === '' ? '' : ` (fecha às ${closesAt})`;
  return `A regra "${trigger.ruleLabel}" vota comprar se a vela fechar ${trigger.side} de ${limit}${closes}. Agora: ${now} — falta ${trigger.distanceText}%.`;
}

// RF18: "Perto do momento de comprar" só para a simulação marcada; some ao fechar a vela ou se o preço se afastar.
export function NoticeNearToast({ trigger }: { readonly trigger: NearTrigger }): ReactElement {
  const { timeZone, dismissNear } = useNoticeCenter();
  const closesAt =
    trigger.closesAt === null
      ? ''
      : formatTimeInZoneText(new Date(trigger.closesAt).toISOString(), timeZone);
  return (
    <li className={`${styles['toast']} ${styles['info']}`}>
      <div className={styles['head']}>
        <span className={styles['state']}>
          <Icon name="horizons" size={14} />
          Perto
        </span>
        <ToastCloseButton onClose={() => dismissNear(trigger.key)} />
      </div>
      <p className={styles['title']}>Perto do momento de comprar</p>
      <p className={styles['pair']}>{trigger.label}</p>
      <p className={styles['main']}>{describeNear(trigger, closesAt)}</p>
      <TriggerProgress percent={trigger.progress} />
      <p className={styles['fixedLine']}>{TREND_NOT_PROMISE}</p>
    </li>
  );
}
