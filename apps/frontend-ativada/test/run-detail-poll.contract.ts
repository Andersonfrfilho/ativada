// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  LIVE_RUN_POLL_MILLISECONDS,
  RUN_KIND,
  RUN_POLL_MILLISECONDS,
  RUN_STATUS,
} from '../src/runs/run.constant.js';
import { detailPollInterval } from '../src/runs/run.validation.js';

describe('intervalo de consulta do detalhe da execução', () => {
  test('a simulação ao vivo rodando espera o WebSocket: consulta a cada 60 s, não a cada 2 s', () => {
    const interval = detailPollInterval(
      { kind: RUN_KIND.LIVE_PAPER, status: RUN_STATUS.RUNNING },
      RUN_POLL_MILLISECONDS,
    );
    expect(interval).toBe(LIVE_RUN_POLL_MILLISECONDS);
    expect(LIVE_RUN_POLL_MILLISECONDS).toBe(60_000);
  });

  test('backtest rodando e simulação ao vivo na fila continuam a cada 2 s', () => {
    expect(
      detailPollInterval(
        { kind: RUN_KIND.BACKTEST, status: RUN_STATUS.RUNNING },
        RUN_POLL_MILLISECONDS,
      ),
    ).toBe(RUN_POLL_MILLISECONDS);
    expect(
      detailPollInterval(
        { kind: RUN_KIND.LIVE_PAPER, status: RUN_STATUS.QUEUED },
        RUN_POLL_MILLISECONDS,
      ),
    ).toBe(RUN_POLL_MILLISECONDS);
  });

  test('execução terminada não consulta mais', () => {
    expect(
      detailPollInterval(
        { kind: RUN_KIND.LIVE_PAPER, status: RUN_STATUS.COMPLETED },
        RUN_POLL_MILLISECONDS,
      ),
    ).toBe(false);
  });
});
