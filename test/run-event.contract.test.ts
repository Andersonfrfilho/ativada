// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { loadDatabaseListenerApi } from './fixtures/postgres-wire/database-source.fixture.js';

const { runEventConstant, runEventSchema } = await loadDatabaseListenerApi();
const { RUN_EVENT_KIND, RUN_EVENTS_CHANNEL } = runEventConstant;
const { parseRunEventPayload } = runEventSchema;

const RUN_ID = '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d0e';

function payload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    runId: RUN_ID,
    kind: RUN_EVENT_KIND.SIGNAL,
    eventId: '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d0f',
    ...overrides,
  });
}

describe('run event payload', () => {
  test('the channel name is a plain identifier', () => {
    expect(RUN_EVENTS_CHANNEL).toBe('run_events');
  });

  test('accepts exactly { runId, kind, eventId }', () => {
    expect(parseRunEventPayload(payload())).toStrictEqual({
      runId: RUN_ID,
      kind: 'signal',
      eventId: '0192f3a1-7c4e-7b2a-9d3f-5e6a7b8c9d0f',
    });
  });

  test.each(Object.values(RUN_EVENT_KIND))('accepts the kind %s', (kind) => {
    expect(parseRunEventPayload(payload({ kind }))?.kind).toBe(kind);
  });

  test('the analyst notice carries the decided candle as its eventId and the kind is analyst', () => {
    expect(RUN_EVENT_KIND.ANALYST).toBe('analyst');
    expect(
      parseRunEventPayload(payload({ kind: 'analyst', eventId: '1789861500000' })),
    ).toStrictEqual({
      runId: RUN_ID,
      kind: 'analyst',
      eventId: '1789861500000',
    });
  });

  test('a user id or any extra field makes the payload invalid (the owner never rides on NOTIFY)', () => {
    expect(parseRunEventPayload(payload({ userId: RUN_ID }))).toBeUndefined();
    expect(parseRunEventPayload(payload({ price: '1' }))).toBeUndefined();
  });

  test.each([
    ['uma execução que não é UUID', { runId: 'run-1' }],
    ['um tipo desconhecido', { kind: 'order' }],
    ['um eventId vazio', { eventId: '' }],
    ['um eventId acima de 64 caracteres', { eventId: 'x'.repeat(65) }],
    ['um eventId que não é texto', { eventId: 7 }],
  ])('rejects %s', (_description, overrides) => {
    expect(parseRunEventPayload(payload(overrides))).toBeUndefined();
  });

  test('rejects text that is not JSON or not an object', () => {
    expect(parseRunEventPayload('não é json')).toBeUndefined();
    expect(parseRunEventPayload('[]')).toBeUndefined();
    expect(parseRunEventPayload('')).toBeUndefined();
  });
});
