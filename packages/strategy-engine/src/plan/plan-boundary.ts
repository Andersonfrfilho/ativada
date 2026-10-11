// Copyright (c) 2026 Ada Technology. All rights reserved.

// Dois índices ADJACENTES da grade do tick: `same` tem o mesmo resultado que o fechamento atual e `different` tem o oposto.
export type Transition = {
  readonly same: number;
  readonly different: number;
};

export type FindTransitionParams = {
  readonly valueAt: (index: number) => boolean;
  // O fechamento atual na grade.
  readonly origin: number;
  readonly maximumIndex: number;
};

const MINIMUM_INDEX = 1;
const FIRST_DISTANCE = 1;
const DISTANCE_GROWTH = 2;

// Entre um índice igual ao da origem e um diferente, a bisseção acha o par ADJACENTE.
function refine(params: {
  readonly valueAt: (index: number) => boolean;
  readonly origin: number;
  readonly same: number;
  readonly different: number;
}): Transition {
  const originValue = params.valueAt(params.origin);
  let { same, different } = params;
  while (Math.abs(different - same) > 1) {
    const step = Math.sign(different - same) * Math.floor(Math.abs(different - same) / 2);
    const middle = same + step;
    if (params.valueAt(middle) === originValue) same = middle;
    else different = middle;
  }
  return { same, different };
}

// A transição mais próxima do fechamento atual: procura em distâncias que dobram (um tick, dois, quatro...) para cima e
// para baixo, com a última passada encostada na borda da faixa, e refina a primeira que mudou até o tick exato. Não presume
// monotonia: o par adjacente achado é sempre válido, mesmo que haja outros mais longe.
export function findTransition(params: FindTransitionParams): Transition | undefined {
  const { valueAt, origin, maximumIndex } = params;
  const originValue = valueAt(origin);
  let quietAbove = origin;
  let quietBelow = origin;
  for (
    let distance = FIRST_DISTANCE;
    quietAbove < maximumIndex || quietBelow > MINIMUM_INDEX;
    distance *= DISTANCE_GROWTH
  ) {
    const above = Math.min(origin + distance, maximumIndex);
    if (above > quietAbove) {
      if (valueAt(above) !== originValue) {
        return refine({ valueAt, origin, same: quietAbove, different: above });
      }
      quietAbove = above;
    }
    const below = Math.max(origin - distance, MINIMUM_INDEX);
    if (below < quietBelow) {
      if (valueAt(below) !== originValue) {
        return refine({ valueAt, origin, same: quietBelow, different: below });
      }
      quietBelow = below;
    }
  }
  return undefined;
}
