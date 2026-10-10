// Copyright (c) 2026 Ada Technology. All rights reserved.
import * as engine from '../../../../packages/strategy-engine/src/index.js';

// A superfície da metade SINAL que o contrato e a tabela de cenários exercitam. O mesmo tipo descreve
// o módulo de produção e as cópias mutadas dele (signal-mutation.fixture.ts).
export type SignalApi = Pick<
  typeof engine,
  | 'castRuleVote'
  | 'computeStrategyLeadInCandles'
  | 'createStrategySignalState'
  | 'evaluateScoreboard'
  | 'formatTruncatedAdx'
  | 'resolveFamilyWeight'
  | 'resolveRegime'
  | 'selectAvailableSentiment'
  | 'signalStep'
>;

export const PRODUCTION_SIGNAL_API: SignalApi = {
  castRuleVote: engine.castRuleVote,
  computeStrategyLeadInCandles: engine.computeStrategyLeadInCandles,
  createStrategySignalState: engine.createStrategySignalState,
  evaluateScoreboard: engine.evaluateScoreboard,
  formatTruncatedAdx: engine.formatTruncatedAdx,
  resolveFamilyWeight: engine.resolveFamilyWeight,
  resolveRegime: engine.resolveRegime,
  selectAvailableSentiment: engine.selectAvailableSentiment,
  signalStep: engine.signalStep,
};
