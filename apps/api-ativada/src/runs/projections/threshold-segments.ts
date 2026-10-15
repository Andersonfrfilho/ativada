// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  RUN_KIND,
  WALK_FORWARD_WINDOW_STATUS,
  type RunRecord,
  type TimeRange,
  type WalkForwardWindowInput,
} from '@ativada/database';
import { z } from '@ativada/environment';
import {
  deriveStrategyConfig,
  formatEngineDecimal,
  toEngineDecimal,
  type StrategyConfig,
} from '@ativada/strategy-engine';

// O trecho de velas decididas que usa um mesmo par de limiares (ADR 0002, spec 009, P4), em ms UTC: `[from, to)`.
export type ThresholdSegment = {
  readonly from: number;
  readonly to: number;
  readonly buy: string;
  readonly sell: string;
};

// A configuração que uma janela de teste do walk-forward usou: a base com a combinação escolhida no ajuste.
export type WindowConfig = {
  readonly window: WalkForwardWindowInput;
  readonly config: StrategyConfig;
};

const BEST_PARAMS_SCHEMA = z.looseObject({
  assignment: z.array(
    z.strictObject({ path: z.string(), value: z.union([z.number(), z.string()]) }),
  ),
});

const canonical = (text: string): string => formatEngineDecimal(toEngineDecimal(text));

// A janela parada (sem parâmetro elegível) fica FORA: o banco não guarda a combinação que ela usou, e reconstruí-la pela
// grade seria recalcular (P4). Janela `ok` sem parâmetros legíveis é dado corrompido e vira erro, nunca um limiar inventado.
export function deriveWindowConfigs(
  base: StrategyConfig,
  windows: readonly WalkForwardWindowInput[],
): readonly WindowConfig[] {
  return windows
    .filter((window) => window.status === WALK_FORWARD_WINDOW_STATUS.OK)
    .map((window) => {
      const parsed = BEST_PARAMS_SCHEMA.safeParse(window.bestParams);
      if (!parsed.success) throw new Error('Parâmetros da janela do walk-forward ilegíveis.');
      const derived = deriveStrategyConfig(base, parsed.data.assignment);
      if (!derived.isValid) throw new Error('Combinação da janela do walk-forward inválida.');
      return { window, config: derived.config };
    });
}

function toSegment(range: TimeRange, config: StrategyConfig): ThresholdSegment {
  return {
    from: range.from,
    to: range.to,
    buy: canonical(config.thresholds.buy),
    sell: canonical(config.thresholds.sell),
  };
}

// Backtest e ao vivo: um trecho só, de uma vela antes do início da faixa (a primeira decisão do ao vivo é a vela
// `início − d`) ao fim dela. Walk-forward: um trecho por janela de teste que terminou bem, com os limiares dela.
export function buildThresholdSegments(params: {
  readonly run: Pick<RunRecord, 'kind'>;
  readonly base: StrategyConfig;
  readonly runRange: TimeRange | undefined;
  readonly durationMilliseconds: number;
  readonly windowConfigs: readonly WindowConfig[];
}): readonly ThresholdSegment[] {
  if (params.run.kind === RUN_KIND.WALK_FORWARD) {
    return params.windowConfigs.map(({ window, config }) =>
      toSegment({ from: window.testStart, to: window.testEnd }, config),
    );
  }
  const { runRange } = params;
  if (runRange === undefined) return [];
  return [
    toSegment({ from: runRange.from - params.durationMilliseconds, to: runRange.to }, params.base),
  ];
}
