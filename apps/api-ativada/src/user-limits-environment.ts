// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

const ALERTS_EXPECTATION = 'inteiro entre 1 e 500';
const ASSETS_EXPECTATION = 'inteiro entre 1 e 200';
const MAX_ENABLED_PRICE_ALERTS = 500;
const DEFAULT_ENABLED_PRICE_ALERTS = 50;
const MAX_USER_ASSETS = 200;
const RUN_STORAGE_EXPECTATION = 'inteiro entre 1 e 10000';
const MAX_RUN_STORAGE = 10_000;
const DEFAULT_RUN_STORAGE = 200;
const DISABLED_ALERTS_EXPECTATION = 'inteiro entre 1 e 500';
const DEFAULT_DISABLED_PRICE_ALERTS = 100;
const STRATEGIES_EXPECTATION = 'inteiro entre 1 e 1000';
const MAX_STRATEGIES = 1_000;
const DEFAULT_STRATEGIES = 100;
const VERSIONS_EXPECTATION = 'inteiro entre 1 e 2000';
const MAX_VERSIONS_PER_STRATEGY = 2_000;
const DEFAULT_VERSIONS_PER_STRATEGY = 200;
const DEFAULT_USER_ASSETS = 50;

function boundedInteger(params: {
  readonly expectation: string;
  readonly maximum: number;
  readonly fallback: number;
}): z.ZodDefault<z.ZodCoercedNumber> {
  return z.coerce
    .number({ error: params.expectation })
    .int({ error: params.expectation })
    .min(1, { error: params.expectation })
    .max(params.maximum, { error: params.expectation })
    .default(params.fallback);
}

const REFIRE_EXPECTATION = 'inteiro de segundos entre 0 e 86400';
const MAX_MIN_REFIRE_SECONDS = 86_400;
const DEFAULT_MIN_REFIRE_SECONDS = 300;

// Tetos de uso por usuário (RF00b) dos alertas de preço ligados (RF14) e dos ativos cadastrados (RF15).
export const userLimitsEnvironmentShape = {
  PRICE_ALERT_MAX_ENABLED_PER_USER: boundedInteger({
    expectation: ALERTS_EXPECTATION,
    maximum: MAX_ENABLED_PRICE_ALERTS,
    fallback: DEFAULT_ENABLED_PRICE_ALERTS,
  }),
  // Alertas de preço desligados à mão (os disparados têm a limpeza própria): o teto de armazenamento do dono.
  PRICE_ALERT_MAX_DISABLED_PER_USER: boundedInteger({
    expectation: DISABLED_ALERTS_EXPECTATION,
    maximum: MAX_ENABLED_PRICE_ALERTS,
    fallback: DEFAULT_DISABLED_PRICE_ALERTS,
  }),
  // Execuções guardadas por usuário (qualquer tipo e estado): apagar uma antiga libera a vaga.
  RUN_STORAGE_MAX_PER_USER: boundedInteger({
    expectation: RUN_STORAGE_EXPECTATION,
    maximum: MAX_RUN_STORAGE,
    fallback: DEFAULT_RUN_STORAGE,
  }),
  STRATEGY_MAX_PER_USER: boundedInteger({
    expectation: STRATEGIES_EXPECTATION,
    maximum: MAX_STRATEGIES,
    fallback: DEFAULT_STRATEGIES,
  }),
  STRATEGY_MAX_VERSIONS_PER_STRATEGY: boundedInteger({
    expectation: VERSIONS_EXPECTATION,
    maximum: MAX_VERSIONS_PER_STRATEGY,
    fallback: DEFAULT_VERSIONS_PER_STRATEGY,
  }),
  USER_ASSET_MAX_PER_USER: boundedInteger({
    expectation: ASSETS_EXPECTATION,
    maximum: MAX_USER_ASSETS,
    fallback: DEFAULT_USER_ASSETS,
  }),
  // Quanto tempo o MESMO alerta de preço espera, desde o último disparo, para disparar de novo (0 desliga a espera).
  PRICE_ALERT_MIN_REFIRE_SECONDS: z.coerce
    .number({ error: REFIRE_EXPECTATION })
    .int({ error: REFIRE_EXPECTATION })
    .min(0, { error: REFIRE_EXPECTATION })
    .max(MAX_MIN_REFIRE_SECONDS, { error: REFIRE_EXPECTATION })
    .default(DEFAULT_MIN_REFIRE_SECONDS),
} as const;
