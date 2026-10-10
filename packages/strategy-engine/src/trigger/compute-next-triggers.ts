// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, formatEngineDecimal, toEngineDecimal } from '../engine-decimal.js';
import { evaluateScoreboard } from '../scoreboard.js';
import { TRIGGER_STATE, TRIGGER_VERSION } from './trigger.constant.js';
import { buildRuleTrigger } from './trigger-rule.js';
import type { ComputeNextTriggersParams, NextTriggers } from './trigger.types.js';

const NO_READING = { current: undefined, previous: undefined } as const;

// O próximo gatilho de cada regra do placar (RF13, ADR 0002 §"Próximo gatilho (T4b.2)"): PURA, sobre as leituras dos
// indicadores no último candle fechado. Aguardando entrada mostra o que falta para cada regra votar COMPRA e para o
// placar chegar ao limiar de compra; comprado, o mesmo para VENDA. Os votos, pesos e a pontuação são os do placar.
export function computeNextTriggers(params: ComputeNextTriggersParams): NextTriggers {
  const { config, readings, state } = params;
  const close = toEngineDecimal(params.close);
  const evaluation = evaluateScoreboard({
    config,
    close: Number(params.close),
    closeTime: params.closeTime,
    readings,
    sentiment: params.sentiment,
    sentimentSource: params.sentimentSource,
  });
  const isEntry = state === TRIGGER_STATE.AWAITING_ENTRY;
  const score = new EngineDecimal(evaluation.score);
  const threshold = toEngineDecimal(isEntry ? config.thresholds.buy : config.thresholds.sell);
  const rules = config.rules.map((rule, index) =>
    buildRuleTrigger({
      rule,
      reading: readings.rules[rule.id] ?? NO_READING,
      vote: evaluation.votes[index] as NonNullable<(typeof evaluation.votes)[number]>,
      close,
      sentiment: evaluation.sentiment,
      state,
    }),
  );
  return {
    version: TRIGGER_VERSION,
    state,
    action: evaluation.action,
    score: formatEngineDecimal(score),
    scoreThreshold: formatEngineDecimal(threshold),
    scoreGap: formatEngineDecimal(isEntry ? threshold.minus(score) : score.minus(threshold)),
    rules,
  };
}
