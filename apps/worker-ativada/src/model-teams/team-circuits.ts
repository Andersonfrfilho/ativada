// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  createClosedCircuit,
  describeCircuit,
  PROVIDER_STATE,
  recordOutcome,
  requestPermission,
  type CircuitOutcome,
  type CircuitState,
  type CircuitView,
  type ModelTeamKey,
  type ProviderState,
} from '@ativada/model-agents';

// O estado do circuito de cada equipe vive na memória do worker (D5): reiniciar = fechado. O estado "parado pelo teto" também.
export type TeamCircuits = {
  readonly requestPermission: (teamKey: ModelTeamKey, nowMilliseconds: number) => boolean;
  readonly record: (
    teamKey: ModelTeamKey,
    outcome: CircuitOutcome,
    nowMilliseconds: number,
  ) => void;
  readonly markBudget: (teamKey: ModelTeamKey, isStopped: boolean) => void;
  readonly describe: (teamKey: ModelTeamKey, nowMilliseconds: number) => TeamView;
};

export type TeamView = CircuitView & { readonly providerState: ProviderState };

export function createTeamCircuits(): TeamCircuits {
  const states = new Map<ModelTeamKey, CircuitState>();
  const stoppedByBudget = new Set<ModelTeamKey>();
  const read = (teamKey: ModelTeamKey): CircuitState =>
    states.get(teamKey) ?? createClosedCircuit();
  return {
    requestPermission: (teamKey, nowMilliseconds): boolean => {
      const permission = requestPermission(read(teamKey), nowMilliseconds);
      states.set(teamKey, permission.state);
      return permission.isPermitted;
    },
    record: (teamKey, outcome, nowMilliseconds): void => {
      states.set(teamKey, recordOutcome(read(teamKey), outcome, nowMilliseconds));
    },
    markBudget: (teamKey, isStopped): void => {
      if (isStopped) stoppedByBudget.add(teamKey);
      else stoppedByBudget.delete(teamKey);
    },
    describe: (teamKey, nowMilliseconds): TeamView => {
      const view = describeCircuit(read(teamKey), nowMilliseconds);
      if (view.providerState === PROVIDER_STATE.READY && stoppedByBudget.has(teamKey)) {
        return { providerState: PROVIDER_STATE.BUDGET_EXHAUSTED, retryAtMilliseconds: null };
      }
      return view;
    },
  };
}
