// Copyright (c) 2026 Ada Technology. All rights reserved.
import { PERCENT, WALK_FORWARD_PROGRESS_BEFORE_COMPLETION } from './walk-forward.constant.js';

export type WalkForwardProgress = {
  // Soma unidades concluídas (uma por combinação × janela na busca; uma por janela no teste) e devolve o percentual.
  readonly advance: (units: number) => number;
  readonly percent: () => number;
};

// Progresso 0–100 por (janela × combinação) concluída; só chega a 100 quando a execução é concluída no banco.
export function createProgress(params: {
  readonly combinations: number;
  readonly windows: number;
  readonly alreadyDone: number;
}): WalkForwardProgress {
  const total = params.combinations * params.windows + params.windows;
  let done = params.alreadyDone;
  const percent = (): number => {
    const value = Math.floor((PERCENT * done) / total);
    return Math.min(WALK_FORWARD_PROGRESS_BEFORE_COMPLETION, Math.max(0, value));
  };
  return {
    advance: (units): number => {
      done += units;
      return percent();
    },
    percent,
  };
}
