// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import { WALK_FORWARD_ERROR_CODE, WINDOW_STATUS } from './walk-forward.constant.js';
import { WalkForwardError } from './walk-forward.error.js';
import type { ParameterCandidate, ParameterSelection } from './walk-forward.types.js';

export type SelectBestParametersParams = {
  readonly candidates: readonly ParameterCandidate[];
  readonly minTradesPerWindow: number;
};

type RankedCandidate = {
  readonly candidate: ParameterCandidate;
  readonly sharpe: EngineDecimalValue;
  readonly drawdown: EngineDecimalValue;
};

function refuse(message: string): never {
  throw new WalkForwardError({ code: WALK_FORWARD_ERROR_CODE.INVALID_SELECTION_INPUT, message });
}

function parseDecimal(text: string, label: string): EngineDecimalValue {
  let value: EngineDecimalValue;
  try {
    value = new EngineDecimal(text);
  } catch {
    return refuse(`${label} não é decimal.`);
  }
  if (!value.isFinite()) return refuse(`${label} não é finito.`);
  return value;
}

function assertParams(params: SelectBestParametersParams): void {
  if (!Number.isSafeInteger(params.minTradesPerWindow) || params.minTradesPerWindow < 1) {
    refuse('O mínimo de operações por janela é um inteiro positivo.');
  }
  const indexes = params.candidates.map((candidate) => candidate.combinationIndex);
  if (new Set(indexes).size !== indexes.length) refuse('Índice de combinação repetido.');
  if (
    params.candidates.some(
      (candidate) => !Number.isSafeInteger(candidate.trades) || candidate.trades < 0,
    )
  ) {
    refuse('Quantidade de operações inválida.');
  }
}

// Elegível: operações fechadas no AJUSTE em número suficiente E Sharpe definido. Quem não opera o bastante, ou
// não tem Sharpe, não compete: nunca se escolhe a "menos pior".
function rankEligible(params: SelectBestParametersParams): readonly RankedCandidate[] {
  return params.candidates.flatMap((candidate): RankedCandidate[] => {
    if (candidate.trades < params.minTradesPerWindow || candidate.sharpe === null) return [];
    return [
      {
        candidate,
        sharpe: parseDecimal(candidate.sharpe, 'sharpe'),
        drawdown: parseDecimal(candidate.maxDrawdownAtLow, 'maxDrawdownAtLow'),
      },
    ];
  });
}

// Ordem total: maior Sharpe, depois mais operações, depois menor drawdown na mínima, depois a primeira da grade.
function isBetter(challenger: RankedCandidate, current: RankedCandidate): boolean {
  if (!challenger.sharpe.equals(current.sharpe))
    return challenger.sharpe.greaterThan(current.sharpe);
  if (challenger.candidate.trades !== current.candidate.trades) {
    return challenger.candidate.trades > current.candidate.trades;
  }
  if (!challenger.drawdown.equals(current.drawdown))
    return challenger.drawdown.lessThan(current.drawdown);
  return challenger.candidate.combinationIndex < current.candidate.combinationIndex;
}

export function selectBestParameters(params: SelectBestParametersParams): ParameterSelection {
  assertParams(params);
  const eligible = rankEligible(params);
  const [first, ...rest] = eligible;
  if (first === undefined) {
    return { status: WINDOW_STATUS.NO_ELIGIBLE_PARAMETERS, eligibleCount: 0 };
  }
  const best = rest.reduce(
    (current, challenger) => (isBetter(challenger, current) ? challenger : current),
    first,
  );
  return { status: WINDOW_STATUS.OK, best: best.candidate, eligibleCount: eligible.length };
}
