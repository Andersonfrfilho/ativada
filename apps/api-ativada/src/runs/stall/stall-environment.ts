// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

const GRACE_EXPECTATION = 'inteiro de minutos entre 5 e 240';
const MINIMUM_GRACE_MINUTES = 5;
const MAXIMUM_GRACE_MINUTES = 240;
const DEFAULT_GRACE_MINUTES = 15;
const SWEEP_EXPECTATION = 'inteiro de segundos entre 5 e 3600';
const MINIMUM_SWEEP_SECONDS = 5;
const MAXIMUM_SWEEP_SECONDS = 3_600;
const DEFAULT_SWEEP_SECONDS = 60;

// Aviso de simulação parada (spec 006, RF12 a RF14): a carência depois do fechamento da vela devida e o ritmo da varredura.
export const stallEnvironmentShape = {
  LIVE_STALL_GRACE_MINUTES: z.coerce
    .number({ error: GRACE_EXPECTATION })
    .int({ error: GRACE_EXPECTATION })
    .min(MINIMUM_GRACE_MINUTES, { error: GRACE_EXPECTATION })
    .max(MAXIMUM_GRACE_MINUTES, { error: GRACE_EXPECTATION })
    .default(DEFAULT_GRACE_MINUTES),
  LIVE_STALL_SWEEP_SECONDS: z.coerce
    .number({ error: SWEEP_EXPECTATION })
    .int({ error: SWEEP_EXPECTATION })
    .min(MINIMUM_SWEEP_SECONDS, { error: SWEEP_EXPECTATION })
    .max(MAXIMUM_SWEEP_SECONDS, { error: SWEEP_EXPECTATION })
    .default(DEFAULT_SWEEP_SECONDS),
} as const;
