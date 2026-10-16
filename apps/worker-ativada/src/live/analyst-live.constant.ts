// Copyright (c) 2026 Ada Technology. All rights reserved.

// Só o código estável chega ao banco (A18): o texto do erro original NUNCA passa adiante.
export const ANALYST_FAILURE_CODE = {
  SERIES_UNAVAILABLE: 'ANALYST_SERIES_UNAVAILABLE',
  INPUT_INVALID: 'ANALYST_INPUT_INVALID',
  ENGINE_REFUSED: 'ANALYST_ENGINE_REFUSED',
} as const;

// Os valores gravados em `analyst_decisions` (o banco os repete em `analyst-decision.constant.ts`; um contrato os confere).
export const ANALYST_RECORD_MODE = { SHADOW: 'shadow' } as const;
export const ANALYST_RECORD_STATUS = { DECIDED: 'decided', FAILED: 'failed' } as const;

// A cópia do analista em memória guarda no máximo estas âncoras diárias por par: o dia atual e o anterior (uma simulação
// atrasada de até um dia não refaz a série a cada vela).
export const ANALYST_SERIES_ANCHORS_PER_PAIR = 2;

// Placar e patrimônio da própria simulação são lidos desta quantidade de velas para trás: a janela do auditor mais a vela
// seguinte a cada previsão (A5).
export const ANALYST_HISTORY_LOOKBACK_CANDLES = 2881;
