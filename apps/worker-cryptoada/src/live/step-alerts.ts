// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { AlertInput } from '@cryptoada/database';
import type { EngineCandle, StepResult } from '@cryptoada/strategy-engine';

import { buildStepAlert, isAlertableSignal } from './build-step-alert.js';
import type { HistoricalHitRate, LiveAlertingSettings, LiveRunSession } from './live-run.types.js';

export type HitRateReader = () => Promise<HistoricalHitRate | undefined>;

// O acerto histórico é refinamento do alerta, não condição dele: leitura que falha vira "sem acerto" e o passo segue. Lida
// no máximo uma vez por ronda, e só quando um sinal precisa dela.
export function createHitRateReader(session: LiveRunSession): HitRateReader {
  let pending: Promise<HistoricalHitRate | undefined> | undefined;
  return () => {
    pending ??= session.findHitRate().catch(() => undefined);
    return pending;
  };
}

export type CollectStepAlertsParams = {
  readonly alerting: LiveAlertingSettings | undefined;
  readonly readHitRate: HitRateReader;
  readonly candle: EngineCandle;
  readonly result: StepResult;
  readonly durationMilliseconds: number;
};

// Candle velho (replay depois de horas parado, retomada) não é notícia: o alerta só nasce dentro da janela de frescor.
function isFresh(params: CollectStepAlertsParams, alerting: LiveAlertingSettings): boolean {
  const age = alerting.now() - params.candle.closeTime;
  return age <= alerting.maxAgeCandles * params.durationMilliseconds;
}

export async function collectStepAlerts(
  params: CollectStepAlertsParams,
): Promise<readonly AlertInput[]> {
  const { alerting, result, candle } = params;
  const { signal } = result.decisions;
  if (alerting === undefined || !isAlertableSignal(signal)) return [];
  if (!isFresh(params, alerting)) return [];
  const hitRate = await params.readHitRate();
  return [
    buildStepAlert({ signal, decisions: result.decisions, candle, state: result.state, hitRate }),
  ];
}
