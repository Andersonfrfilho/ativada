// Copyright (c) 2026 Ada Technology. All rights reserved.

export type RankableEvaluation = {
  readonly windowCount: number;
  readonly reachedCount: number;
  readonly stoppedCount: number;
};

export type RankableCombination = {
  // Desempate final estável: identifica a combinação (estratégia × par).
  readonly key: string;
  readonly evaluation: RankableEvaluation;
};

function compareKeys(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

// Frações comparadas por multiplicação cruzada nos inteiros das contagens, nunca pelas taxas arredondadas.
function compareReachDescending(left: RankableEvaluation, right: RankableEvaluation): number {
  return right.reachedCount * left.windowCount - left.reachedCount * right.windowCount;
}

function compareStopAscending(left: RankableEvaluation, right: RankableEvaluation): number {
  return left.stoppedCount * right.windowCount - right.stoppedCount * left.windowCount;
}

function compareCombinations(left: RankableCombination, right: RankableCombination): number {
  const first = left.evaluation;
  const second = right.evaluation;
  const isFirstEmpty = first.windowCount === 0;
  if (isFirstEmpty !== (second.windowCount === 0)) return isFirstEmpty ? 1 : -1;
  const reach = isFirstEmpty ? 0 : compareReachDescending(first, second);
  if (reach !== 0) return reach;
  const stop = isFirstEmpty ? 0 : compareStopAscending(first, second);
  if (stop !== 0) return stop;
  const windows = second.windowCount - first.windowCount;
  return windows === 0 ? compareKeys(left.key, right.key) : windows;
}

// O ranking de metas (RF13): maior fração de janelas que chegaram ao alvo; empate pela menor fração que bateu o stop,
// depois pelo maior número de janelas e, por fim, pela chave. Sem janela nenhuma vai por último. A lista de entrada
// não é alterada e o resultado não depende da ordem dela.
export function rankGoalCombinations<TCombination extends RankableCombination>(
  combinations: readonly TCombination[],
): TCombination[] {
  return [...combinations].sort(compareCombinations);
}
