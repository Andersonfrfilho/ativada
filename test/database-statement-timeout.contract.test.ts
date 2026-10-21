// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { loadDatabaseConnectionApi } from './fixtures/database-connection/database-connection-source.fixture.js';

const { statementTimeout } = await loadDatabaseConnectionApi();

describe('statement_timeout do servidor (ADR 0002, R4)', () => {
  test.each([
    [30, 25_000],
    [300, 295_000],
    [600, 595_000],
    [10, 5_000],
    [7, 2_000],
  ])(
    'teto do cliente de %i s: o servidor aborta em %i ms, 5 s antes',
    (clientSeconds, expected) => {
      expect(statementTimeout.computeStatementTimeoutMilliseconds(clientSeconds)).toBe(expected);
    },
  );

  test.each([6, 5, 3, 1])('teto do cliente de %i s: o piso é 1 s', (clientSeconds) => {
    expect(statementTimeout.computeStatementTimeoutMilliseconds(clientSeconds)).toBe(1_000);
  });

  test('o servidor sempre aborta antes do cliente quando há margem para isso', () => {
    for (let seconds = 7; seconds <= 600; seconds += 1) {
      expect(statementTimeout.computeStatementTimeoutMilliseconds(seconds)).toBeLessThan(
        seconds * 1_000,
      );
    }
  });
});
