// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { loadApiApp } from './fixtures/api-routes/api-app.fixture.js';

const app = await loadApiApp();
const SAMPLE_ID = '0198c1a2-7b3d-7c4e-8f5a-123456789abc';
const POSTGRES_INSTANT = '2026-10-10 12:34:56.123456+00';
const ISO_INSTANT = '2026-10-10T12:34:56.123Z';
const INVALID_INSTANTS = [
  'abc',
  '',
  '2026-02-31 10:00:00+00',
  '2026-13-01 10:00:00+00',
  '0000-01-01 10:00:00+00',
  '2026-10-10 25:00:00+00',
  '2026-10-10 12:34:56+99',
  "2026-10-10 12:34:56'; DROP TABLE runs;--",
  'now',
] as const;

function forge(payload: object): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

describe('cursor de runs e de estratégias: o instante `c` é validado no esquema', () => {
  test.each([POSTGRES_INSTANT, ISO_INSTANT])(
    'instante %s é aceito nos dois cursores',
    (instant) => {
      const text = forge({ c: instant, i: SAMPLE_ID });
      expect(app.runCursor.decodeRunCursor(text)).toStrictEqual({
        createdAt: instant,
        id: SAMPLE_ID,
      });
      expect(app.strategyCursor.decodeStrategyCursor(text)).toStrictEqual({
        createdAt: instant,
        id: SAMPLE_ID,
      });
    },
  );

  test.each(INVALID_INSTANTS.map((instant) => [instant] as const))(
    'instante inválido %p vira cursor adulterado nos dois cursores',
    (instant) => {
      const text = forge({ c: instant, i: SAMPLE_ID });
      expect(app.runCursor.decodeRunCursor(text)).toBeUndefined();
      expect(app.strategyCursor.decodeStrategyCursor(text)).toBeUndefined();
    },
  );
});
