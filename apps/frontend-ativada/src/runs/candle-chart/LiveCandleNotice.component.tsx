// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import type { LiveCandleView } from '../../live/live-candle.js';
import controls from '../../styles/Controls.module.css';

export type LiveCandleNoticeProps = { readonly live: LiveCandleView | undefined };

// O preço ao vivo parou de chegar: a vela em formação sai do gráfico e a tela diz por quê, com os segundos (RF16).
export function LiveCandleNotice({ live }: LiveCandleNoticeProps): ReactElement | null {
  if (live?.status !== 'no_data') return null;
  return (
    <p className={controls.muted} role="status">
      Sem dados ao vivo há {live.secondsWithoutData} s: a vela em formação volta quando o preço
      voltar a chegar.
    </p>
  );
}
