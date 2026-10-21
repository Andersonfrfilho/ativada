// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import type { CircuitView } from '../packages/model-agents/src/index.js';
import { loadModelAgentsApi } from './fixtures/model-agents/model-agents-api.fixture.js';

// T1.3 da spec 015 (RF12, plan D5): todas as transições do circuito, com relógio falso (o tempo entra por parâmetro).

const api = await loadModelAgentsApi();
const MINUTE = 60_000;
const NOW = 1_000_000;

type State = ReturnType<typeof api.createClosedCircuit>;

function fail(state: State, status: 'timeout' | 'unavailable', at: number): State {
  return api.recordOutcome(state, { status }, at);
}

function openedByThreeFailures(): State {
  let state = api.createClosedCircuit();
  for (const status of ['timeout', 'unavailable', 'timeout'] as const) {
    state = fail(state, status, NOW);
  }
  return state;
}

describe('falhas seguidas abrem o circuito (RF12)', () => {
  test('começa fechado e deixa passar', () => {
    const state = api.createClosedCircuit();
    expect(api.requestPermission(state, NOW)).toStrictEqual({ isPermitted: true, state });
  });

  test('duas falhas ainda deixam fechado; a terceira abre por 10 min', () => {
    let state = fail(api.createClosedCircuit(), 'timeout', NOW);
    expect(state).toStrictEqual({ kind: 'closed', consecutiveFailures: 1 });
    state = fail(state, 'unavailable', NOW);
    expect(state).toStrictEqual({ kind: 'closed', consecutiveFailures: 2 });
    state = fail(state, 'timeout', NOW);
    expect(state).toStrictEqual({ kind: 'open', until: NOW + 10 * MINUTE, cause: 'unavailable' });
  });

  test('um sucesso no meio zera a contagem', () => {
    let state = fail(fail(api.createClosedCircuit(), 'timeout', NOW), 'timeout', NOW);
    state = api.recordOutcome(state, { status: 'ok' }, NOW);
    expect(state).toStrictEqual({ kind: 'closed', consecutiveFailures: 0 });
    state = fail(fail(state, 'timeout', NOW), 'timeout', NOW);
    expect(state.kind).toBe('closed');
  });

  test('saída inválida, recusa e pedido ruim também zeram (o provedor respondeu)', () => {
    for (const status of ['invalid_output', 'refused', 'bad_request'] as const) {
      const start = fail(fail(api.createClosedCircuit(), 'timeout', NOW), 'timeout', NOW);
      expect(api.recordOutcome(start, { status }, NOW)).toStrictEqual({
        kind: 'closed',
        consecutiveFailures: 0,
      });
    }
  });

  test('aberto, não deixa passar até vencer; no instante do vencimento deixa a prova', () => {
    const state = openedByThreeFailures();
    expect(api.requestPermission(state, NOW + 10 * MINUTE - 1).isPermitted).toBe(false);
    const probe = api.requestPermission(state, NOW + 10 * MINUTE);
    expect(probe.isPermitted).toBe(true);
    expect(probe.state).toStrictEqual({ kind: 'half_open', cause: 'unavailable' });
  });
});

describe('chamada de prova (meio aberto)', () => {
  const probing = (): State =>
    api.requestPermission(openedByThreeFailures(), NOW + 10 * MINUTE).state;

  test('só UMA prova por vez', () => {
    expect(api.requestPermission(probing(), NOW + 10 * MINUTE).isPermitted).toBe(false);
  });

  test('prova que dá certo fecha', () => {
    const closed = api.recordOutcome(probing(), { status: 'ok' }, NOW + 10 * MINUTE);
    expect(closed).toStrictEqual({ kind: 'closed', consecutiveFailures: 0 });
    expect(api.requestPermission(closed, NOW + 10 * MINUTE).isPermitted).toBe(true);
  });

  test('prova que falha reabre por mais 10 min, de uma vez', () => {
    const later = NOW + 10 * MINUTE;
    const reopened = fail(probing(), 'timeout', later);
    expect(reopened).toStrictEqual({
      kind: 'open',
      until: later + 10 * MINUTE,
      cause: 'unavailable',
    });
  });
});

describe('429, chave recusada e modelo inexistente', () => {
  test('429 abre até o Retry-After', () => {
    const state = api.recordOutcome(
      api.createClosedCircuit(),
      { status: 'rate_limited', retryAfterMilliseconds: 30_000 },
      NOW,
    );
    expect(state).toStrictEqual({ kind: 'open', until: NOW + 30_000, cause: 'rate_limited' });
  });

  test('o Retry-After tem teto de 15 min', () => {
    const exactly = api.recordOutcome(
      api.createClosedCircuit(),
      { status: 'rate_limited', retryAfterMilliseconds: 15 * MINUTE },
      NOW,
    );
    const above = api.recordOutcome(
      api.createClosedCircuit(),
      { status: 'rate_limited', retryAfterMilliseconds: 99 * MINUTE },
      NOW,
    );
    expect(exactly).toStrictEqual({
      kind: 'open',
      until: NOW + 15 * MINUTE,
      cause: 'rate_limited',
    });
    expect(above).toStrictEqual(exactly);
  });

  test('429 abre de uma vez, sem esperar 3 falhas', () => {
    const state = api.recordOutcome(
      api.createClosedCircuit(),
      { status: 'rate_limited', retryAfterMilliseconds: MINUTE },
      NOW,
    );
    expect(state.kind).toBe('open');
  });

  test('chave recusada abre por 1 h', () => {
    expect(
      api.recordOutcome(api.createClosedCircuit(), { status: 'key_rejected' }, NOW),
    ).toStrictEqual({
      kind: 'open',
      until: NOW + 60 * MINUTE,
      cause: 'key_rejected',
    });
  });

  test('modelo inexistente abre por 1 h', () => {
    expect(
      api.recordOutcome(api.createClosedCircuit(), { status: 'model_not_found' }, NOW),
    ).toStrictEqual({ kind: 'open', until: NOW + 60 * MINUTE, cause: 'model_not_found' });
  });

  test('uma falha que chega com o circuito já aberto não o estende', () => {
    const open = openedByThreeFailures();
    expect(fail(open, 'timeout', NOW + 5 * MINUTE)).toStrictEqual(open);
  });
});

describe('o que o painel vê (RF22)', () => {
  test('fechado e meio aberto aparecem como prontos, sem hora', () => {
    const ready: CircuitView = { providerState: 'ready', retryAtMilliseconds: null };
    expect(api.describeCircuit(api.createClosedCircuit(), NOW)).toStrictEqual(ready);
    expect(api.describeCircuit({ kind: 'half_open', cause: 'unavailable' }, NOW)).toStrictEqual(
      ready,
    );
  });

  test('aberto por falha ou por 429 é "circuit_open" com a hora da volta', () => {
    const view = api.describeCircuit(openedByThreeFailures(), NOW + 1);
    expect(view).toStrictEqual({
      providerState: 'circuit_open',
      retryAtMilliseconds: NOW + 10 * MINUTE,
    });
    const limited = api.recordOutcome(
      api.createClosedCircuit(),
      { status: 'rate_limited', retryAfterMilliseconds: MINUTE },
      NOW,
    );
    expect(api.describeCircuit(limited, NOW).providerState).toBe('circuit_open');
  });

  test('chave recusada e modelo inexistente têm estado próprio', () => {
    const rejected = api.recordOutcome(api.createClosedCircuit(), { status: 'key_rejected' }, NOW);
    const missing = api.recordOutcome(
      api.createClosedCircuit(),
      { status: 'model_not_found' },
      NOW,
    );
    expect(api.describeCircuit(rejected, NOW).providerState).toBe('key_rejected');
    expect(api.describeCircuit(missing, NOW).providerState).toBe('model_not_found');
  });

  test('vencido, volta a aparecer pronto', () => {
    const view = api.describeCircuit(openedByThreeFailures(), NOW + 10 * MINUTE);
    expect(view).toStrictEqual({ providerState: 'ready', retryAtMilliseconds: null });
  });
});
