// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { ReactElement } from 'react';

import { HistoryNote } from '../layout/HistoryNote.component.js';

export const LIVE_SIMULATION_NOTICE = 'Simulação: nenhum dinheiro real foi usado.';
export const TRADE_NOTICE_LABEL = 'Leia com cuidado sobre as operações';

// O aviso fixo do cartão (RF16): é histórico, não promessa; na simulação ao vivo diz também que não há dinheiro real.
export function TradeNotice({ isLive }: { readonly isLive: boolean }): ReactElement {
  return isLive ? (
    <HistoryNote label={TRADE_NOTICE_LABEL} extra={LIVE_SIMULATION_NOTICE} />
  ) : (
    <HistoryNote label={TRADE_NOTICE_LABEL} />
  );
}
