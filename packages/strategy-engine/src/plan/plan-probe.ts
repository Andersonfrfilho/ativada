// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { EngineCandle, SentimentObservation } from '../engine-candle.types.js';
import type { SignalDecision } from '../engine-decision.types.js';
import { ENGINE_TIMEFRAME_DURATION_MILLISECONDS } from '../engine.constant.js';
import { EngineDecimal, formatEngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import type { SignalState } from '../engine-state.types.js';
import { signalStep } from '../signal-step.js';
import { StrategyEngineError } from '../strategy-engine.error.js';
import type { RunSetup, StrategyVersion } from '../strategy-config.types.js';

export type PlanProbeParams = {
  readonly strategy: StrategyVersion;
  readonly run: RunSetup;
  // O estado do sinal DEPOIS do último candle fechado.
  readonly state: SignalState;
  readonly last: EngineCandle;
  readonly sentiment: SentimentObservation | undefined;
};

export type PlanProbe = {
  // A decisão do placar se o próximo candle fechar no preço `index × tick`.
  readonly decide: (index: number) => SignalDecision;
  readonly priceOf: (index: number) => EngineDecimalValue;
};

// O candle seguinte que o plano pressupõe: abre no último fechamento, a máxima e a mínima são as pontas entre abertura e
// fechamento, e o volume repete o do último candle. É o único candle hipotético do plano (ADR 0002 §"Plano de operação").
export function buildNextCandle(last: EngineCandle, closeText: string): EngineCandle {
  const duration = ENGINE_TIMEFRAME_DURATION_MILLISECONDS[last.timeframe];
  const open = new EngineDecimal(last.close);
  const close = new EngineDecimal(closeText);
  return {
    symbol: last.symbol,
    timeframe: last.timeframe,
    openTime: last.openTime + duration,
    closeTime: last.closeTime + duration,
    open: last.close,
    high: formatEngineDecimal(EngineDecimal.max(open, close)),
    low: formatEngineDecimal(EngineDecimal.min(open, close)),
    close: closeText,
    volume: last.volume,
  };
}

// A MESMA metade-sinal do motor de produção (`signalStep`) sobre o candle hipotético: o preço do plano é o que o motor
// decidiria, não uma fórmula paralela. Cada preço é decidido uma vez (várias buscas dividem as decisões).
export function createPlanProbe(params: PlanProbeParams): PlanProbe {
  const tick = new EngineDecimal(params.run.parameters.tickSize);
  const decisions = new Map<number, SignalDecision>();
  const priceOf = (index: number): EngineDecimalValue => tick.times(index);
  return {
    priceOf,
    decide: (index): SignalDecision => {
      const cached = decisions.get(index);
      if (cached !== undefined) return cached;
      const { signal } = signalStep({
        strategy: params.strategy,
        market: params.run.parameters,
        state: params.state,
        candle: buildNextCandle(params.last, formatEngineDecimal(priceOf(index))),
        sentiment: params.sentiment,
      });
      if (signal === null) throw new StrategyEngineError('O plano exige o sinal já aquecido.');
      decisions.set(index, signal);
      return signal;
    },
  };
}
