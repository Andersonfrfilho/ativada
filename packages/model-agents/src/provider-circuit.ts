// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MODEL_CALL_STATUS, type ModelCallStatus } from './model-call-result.types.js';
import { PROVIDER_STATE, type ProviderState } from './provider-state.constant.js';

const MINUTE_MILLISECONDS = 60_000;

// RF12 / plan D5.
export const CIRCUIT_RULES = {
  consecutiveFailuresToOpen: 3,
  unavailableOpenMilliseconds: 10 * MINUTE_MILLISECONDS,
  rateLimitCapMilliseconds: 15 * MINUTE_MILLISECONDS,
  rejectedOpenMilliseconds: 60 * MINUTE_MILLISECONDS,
} as const;

export type OpenCause = 'unavailable' | 'rate_limited' | 'key_rejected' | 'model_not_found';

const CAUSE_TO_PROVIDER_STATE: Readonly<Record<OpenCause, ProviderState>> = {
  unavailable: PROVIDER_STATE.CIRCUIT_OPEN,
  rate_limited: PROVIDER_STATE.CIRCUIT_OPEN,
  key_rejected: PROVIDER_STATE.KEY_REJECTED,
  model_not_found: PROVIDER_STATE.MODEL_NOT_FOUND,
};

export type CircuitState =
  | { readonly kind: 'closed'; readonly consecutiveFailures: number }
  | { readonly kind: 'open'; readonly until: number; readonly cause: OpenCause }
  | { readonly kind: 'half_open'; readonly cause: OpenCause };

export type CircuitOutcome = {
  readonly status: ModelCallStatus;
  readonly retryAfterMilliseconds?: number;
};

export type CircuitPermission = { readonly isPermitted: boolean; readonly state: CircuitState };

export type CircuitView = {
  readonly providerState: ProviderState;
  readonly retryAtMilliseconds: number | null;
};

export function createClosedCircuit(): CircuitState {
  return { kind: 'closed', consecutiveFailures: 0 };
}

// Aberto vencido deixa passar UMA chamada de prova (meio aberto); enquanto ela voa, ninguém mais passa.
export function requestPermission(state: CircuitState, nowMilliseconds: number): CircuitPermission {
  if (state.kind === 'closed') return { isPermitted: true, state };
  if (state.kind === 'half_open') return { isPermitted: false, state };
  if (nowMilliseconds < state.until) return { isPermitted: false, state };
  return { isPermitted: true, state: { kind: 'half_open', cause: state.cause } };
}

function openFor(cause: OpenCause, nowMilliseconds: number, duration: number): CircuitState {
  return { kind: 'open', until: nowMilliseconds + duration, cause };
}

function recordUnavailable(state: CircuitState, nowMilliseconds: number): CircuitState {
  if (state.kind === 'open') return state;
  const failures = state.kind === 'closed' ? state.consecutiveFailures + 1 : 1;
  const mustOpen =
    state.kind === 'half_open' || failures >= CIRCUIT_RULES.consecutiveFailuresToOpen;
  if (!mustOpen) return { kind: 'closed', consecutiveFailures: failures };
  return openFor('unavailable', nowMilliseconds, CIRCUIT_RULES.unavailableOpenMilliseconds);
}

function recordRateLimited(outcome: CircuitOutcome, nowMilliseconds: number): CircuitState {
  const requested = Math.max(0, outcome.retryAfterMilliseconds ?? 0);
  const wait = Math.min(requested, CIRCUIT_RULES.rateLimitCapMilliseconds);
  return openFor('rate_limited', nowMilliseconds, wait);
}

// `ok` e `invalid_output` fecham (o provedor respondeu); recusa e pedido ruim também respondem.
export function recordOutcome(
  state: CircuitState,
  outcome: CircuitOutcome,
  nowMilliseconds: number,
): CircuitState {
  switch (outcome.status) {
    case MODEL_CALL_STATUS.TIMEOUT:
    case MODEL_CALL_STATUS.UNAVAILABLE:
      return recordUnavailable(state, nowMilliseconds);
    case MODEL_CALL_STATUS.RATE_LIMITED:
      return recordRateLimited(outcome, nowMilliseconds);
    case MODEL_CALL_STATUS.KEY_REJECTED:
      return openFor('key_rejected', nowMilliseconds, CIRCUIT_RULES.rejectedOpenMilliseconds);
    case MODEL_CALL_STATUS.MODEL_NOT_FOUND:
      return openFor('model_not_found', nowMilliseconds, CIRCUIT_RULES.rejectedOpenMilliseconds);
    default:
      return createClosedCircuit();
  }
}

// O que o painel mostra (RF22): só enquanto o aberto não venceu; depois disso a próxima chamada é a prova.
export function describeCircuit(state: CircuitState, nowMilliseconds: number): CircuitView {
  if (state.kind !== 'open' || nowMilliseconds >= state.until) {
    return { providerState: PROVIDER_STATE.READY, retryAtMilliseconds: null };
  }
  return { providerState: CAUSE_TO_PROVIDER_STATE[state.cause], retryAtMilliseconds: state.until };
}
