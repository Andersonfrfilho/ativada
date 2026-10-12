// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import styles from './LiveStatusBadge.module.css';
import { STREAM_STATUS, type StreamStatus } from './stream.constant.js';

const LABEL: Readonly<Record<StreamStatus, string>> = {
  [STREAM_STATUS.LIVE]: 'Ao vivo',
  [STREAM_STATUS.CONNECTING]: 'Conectando…',
  [STREAM_STATUS.RECONNECTING]: 'Reconectando…',
  [STREAM_STATUS.BLOCKED]: 'Conta inativa',
  [STREAM_STATUS.STOPPED]: 'Sem conexão ao vivo',
};

export type LiveStatusBadgeProps = { readonly status: StreamStatus };

export function LiveStatusBadge({ status }: LiveStatusBadgeProps): ReactElement {
  const isLive = status === STREAM_STATUS.LIVE;
  return (
    <span role="status" className={isLive ? `${styles.badge} ${styles.live}` : styles.badge}>
      <span className={styles.dot} aria-hidden="true" />
      {LABEL[status]}
    </span>
  );
}
