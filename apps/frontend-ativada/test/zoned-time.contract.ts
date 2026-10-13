// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_TIME_ZONE,
  formatInZone,
  resolveTimeZone,
  zoneLabel,
} from '../src/format/zoned-time.js';

const SAO_PAULO = 'America/Sao_Paulo';
const NEW_YORK = 'America/New_York';
const INVALID_ZONE = 'Marte/Olympus';

// Troca de 2026 em Nova York: começa em 8 de março (02:00 local = 07:00 UTC) e termina em 1º de novembro (02:00 = 06:00 UTC).
const BEFORE_SPRING = Date.parse('2026-03-08T06:59:00.000Z');
const AFTER_SPRING = Date.parse('2026-03-08T07:00:00.000Z');
const BEFORE_FALL = Date.parse('2026-11-01T05:59:00.000Z');
const AFTER_FALL = Date.parse('2026-11-01T06:00:00.000Z');

describe('formatInZone', () => {
  test('São Paulo is GMT-3 all year (no daylight saving)', () => {
    expect(formatInZone(Date.parse('2026-01-15T15:30:00.000Z'), SAO_PAULO)).toBe(
      '15/01/2026 12:30',
    );
    expect(formatInZone(Date.parse('2026-07-15T15:30:00.000Z'), SAO_PAULO)).toBe(
      '15/07/2026 12:30',
    );
  });

  test('midnight stays 00:00, never 24:00', () => {
    expect(formatInZone(Date.parse('2026-05-10T03:00:00.000Z'), SAO_PAULO)).toBe(
      '10/05/2026 00:00',
    );
  });

  test('New York moves one hour forward at the spring change', () => {
    expect(formatInZone(BEFORE_SPRING, NEW_YORK)).toBe('08/03/2026 01:59');
    expect(formatInZone(AFTER_SPRING, NEW_YORK)).toBe('08/03/2026 03:00');
  });

  test('New York moves one hour back at the fall change', () => {
    expect(formatInZone(BEFORE_FALL, NEW_YORK)).toBe('01/11/2026 01:59');
    expect(formatInZone(AFTER_FALL, NEW_YORK)).toBe('01/11/2026 01:00');
  });

  test('UTC is shown as it is', () => {
    expect(formatInZone(Date.parse('2026-03-08T07:00:00.000Z'), 'UTC')).toBe('08/03/2026 07:00');
  });

  test('an invalid zone falls back to the default zone', () => {
    const instant = Date.parse('2026-01-15T15:30:00.000Z');
    expect(formatInZone(instant, INVALID_ZONE)).toBe(formatInZone(instant, DEFAULT_TIME_ZONE));
  });
});

describe('zoneLabel', () => {
  test('São Paulo is GMT−3 with the typographic minus', () => {
    expect(zoneLabel(SAO_PAULO, AFTER_SPRING)).toBe('GMT−3');
    expect(zoneLabel(SAO_PAULO, AFTER_FALL)).toBe('GMT−3');
  });

  test('New York is GMT−5 before the spring change and GMT−4 after it', () => {
    expect(zoneLabel(NEW_YORK, BEFORE_SPRING)).toBe('GMT−5');
    expect(zoneLabel(NEW_YORK, AFTER_SPRING)).toBe('GMT−4');
  });

  test('New York is GMT−4 before the fall change and GMT−5 after it', () => {
    expect(zoneLabel(NEW_YORK, BEFORE_FALL)).toBe('GMT−4');
    expect(zoneLabel(NEW_YORK, AFTER_FALL)).toBe('GMT−5');
  });

  test('half-hour zones keep the minutes and UTC has no offset', () => {
    expect(zoneLabel('Asia/Kolkata', AFTER_SPRING)).toBe('GMT+5:30');
    expect(zoneLabel('UTC', AFTER_SPRING)).toBe('GMT');
  });

  test('an invalid zone is labelled as the default zone', () => {
    expect(zoneLabel(INVALID_ZONE, AFTER_SPRING)).toBe('GMT−3');
  });
});

describe('resolveTimeZone', () => {
  test('keeps a valid zone, defaults the missing and the invalid', () => {
    expect(resolveTimeZone(NEW_YORK)).toBe(NEW_YORK);
    expect(resolveTimeZone(undefined)).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone('')).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone(INVALID_ZONE)).toBe(DEFAULT_TIME_ZONE);
  });
});
