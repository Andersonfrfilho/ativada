// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { DataWaitState } from '@ativada/database';

export type GapPolicy = {
  readonly now: () => number;
  // Quando (ms) terminou a última recuperação de lacunas sem erro; 0 enquanto nenhuma terminou desde que o worker subiu.
  readonly lastCleanRecoveryAt: () => number;
  // Quantas recuperações limpas precisam deixar o buraco como estava para a Binance valer como "não tem".
  readonly confirmAfterFailedRecoveries: number;
  // Um candle recém-fechado pode demorar a aparecer no REST: abaixo desta idade nenhuma contagem confirma.
  readonly minimumGapAgeMilliseconds: number;
  // Além desta idade a recuperação nem olha mais: esperar por ele seria esperar para sempre.
  readonly recoveryLookbackMilliseconds: number;
};

export type GapEvidenceParams = {
  readonly policy: GapPolicy;
  readonly state: DataWaitState;
  readonly lastMissingOpenTime: number;
  readonly durationMilliseconds: number;
};

// A decisão sobre uma lacuna sai da evidência GRAVADA na execução (recuperações que falharam em preenchê-la) ou da idade do
// buraco, nunca da memória do worker: reiniciar o processo não a perde nem a repete.
export function isGapConfirmedByEvidence(params: GapEvidenceParams): boolean {
  const { policy, state } = params;
  const age = policy.now() - (params.lastMissingOpenTime + params.durationMilliseconds);
  if (age > policy.recoveryLookbackMilliseconds) return true;
  return (
    age >= policy.minimumGapAgeMilliseconds &&
    state.failedRecoveries >= policy.confirmAfterFailedRecoveries
  );
}
