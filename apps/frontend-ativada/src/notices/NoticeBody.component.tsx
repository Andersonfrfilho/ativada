// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import styles from './Notices.module.css';
import type { Notice } from './notice.validation.js';
import { describeNoticePair, fillTimeTokens } from './notice-text.js';

export const FIXED_LINE = 'Simulação com dinheiro fictício · tendência, não promessa';

// O texto do aviso: o par e a vela, a frase do servidor com o horário no fuso da pessoa, o detalhe e a linha fixa.
export function NoticeBody(props: {
  readonly notice: Notice;
  readonly timeZone: string;
  readonly hasFixedLine: boolean;
}): ReactElement {
  const { notice, timeZone, hasFixedLine } = props;
  return (
    <>
      <p className={styles['title']}>{notice.title}</p>
      <p className={styles['pair']}>{describeNoticePair(notice)}</p>
      <p className={styles['main']}>{fillTimeTokens(notice.message, notice, timeZone)}</p>
      {notice.detail === null ? null : (
        <p className={styles['detail']}>{fillTimeTokens(notice.detail, notice, timeZone)}</p>
      )}
      {hasFixedLine ? <p className={styles['fixedLine']}>{FIXED_LINE}</p> : null}
    </>
  );
}
