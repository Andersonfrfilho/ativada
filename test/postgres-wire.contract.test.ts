// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { loadDatabaseListenerApi } from './fixtures/postgres-wire/database-source.fixture.js';

const { wireDecode, wireEncode } = await loadDatabaseListenerApi();
const { createFrameReader, decodeAuthentication, decodeErrorSqlState, decodeNotification } =
  wireDecode;
const {
  encodeQuery,
  encodeSaslInitialResponse,
  encodeSaslResponse,
  encodeSslRequest,
  encodeStartup,
  encodeTerminate,
} = wireEncode;

const ENCODER = new TextEncoder();

function bytesOf(...parts: readonly (number | string)[]): Uint8Array {
  return Uint8Array.from(
    parts.flatMap((part) => (typeof part === 'number' ? [part] : [...ENCODER.encode(part)])),
  );
}

function int32(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function frame(type: string, ...body: readonly (number | string)[]): Uint8Array {
  const payload = bytesOf(...body);
  return bytesOf(type, ...int32(payload.length + 4), ...payload);
}

describe('postgres wire encoding', () => {
  test('SSLRequest is length 8 followed by the magic code 80877103', () => {
    expect([...encodeSslRequest()]).toStrictEqual([...int32(8), ...int32(80_877_103)]);
  });

  test('startup carries protocol 3.0 and null-terminated parameter pairs', () => {
    const encoded = encodeStartup({ user: 'u', database: 'd', applicationName: 'a' });
    const body = [...bytesOf('user\0u\0database\0d\0application_name\0a\0\0')];
    expect([...encoded]).toStrictEqual([...int32(8 + body.length), ...int32(196_608), ...body]);
  });

  test('simple query is Q, length, text and a terminating zero', () => {
    expect([...encodeQuery('LISTEN "x"')]).toStrictEqual([
      ...bytesOf('Q', ...int32(4 + 11), 'LISTEN "x"', 0),
    ]);
    expect([...encodeQuery('')]).toStrictEqual([...bytesOf('Q', ...int32(5), 0)]);
  });

  test('SASL initial response names the mechanism and gives the data length', () => {
    const encoded = encodeSaslInitialResponse({ mechanism: 'SCRAM-SHA-256', data: 'n,,n=,r=abc' });
    expect([...encoded]).toStrictEqual([
      ...bytesOf('p', ...int32(4 + 14 + 4 + 11), 'SCRAM-SHA-256', 0, ...int32(11), 'n,,n=,r=abc'),
    ]);
  });

  test('SASL response is p, length and the raw data', () => {
    expect([...encodeSaslResponse('c=biws')]).toStrictEqual([
      ...bytesOf('p', ...int32(10), 'c=biws'),
    ]);
  });

  test('terminate is X with length 4', () => {
    expect([...encodeTerminate()]).toStrictEqual([...bytesOf('X', ...int32(4))]);
  });
});

describe('postgres wire frame reader', () => {
  test('returns the frames of one chunk', () => {
    const reader = createFrameReader();
    const frames = reader.push(Uint8Array.from([...frame('Z', 73), ...frame('I')]));
    expect(frames.map((item) => item.type)).toStrictEqual(['Z', 'I']);
    expect([...(frames[0]?.body ?? [])]).toStrictEqual([73]);
  });

  test('joins a frame split across chunks and keeps the remainder', () => {
    const reader = createFrameReader();
    const whole = Uint8Array.from([...frame('C', 'LISTEN', 0), ...frame('Z', 73)]);
    const collected: string[] = [];
    for (let index = 0; index < whole.length; index += 3) {
      for (const item of reader.push(whole.slice(index, index + 3))) collected.push(item.type);
    }
    expect(collected).toStrictEqual(['C', 'Z']);
  });

  test('a frame larger than the ceiling is a protocol error before it is buffered', () => {
    const reader = createFrameReader({ maxFrameBytes: 16 });
    expect(() => reader.push(bytesOf('A', ...int32(1_000_000)))).toThrow();
  });

  test('a frame with a length below 4 is a protocol error', () => {
    const reader = createFrameReader();
    expect(() => reader.push(bytesOf('A', ...int32(2)))).toThrow();
  });
});

describe('postgres wire frame reader — cost and ceiling', () => {
  const EMPTY_FRAME_BYTES = 5;

  function emptyFrames(count: number): Uint8Array {
    return Uint8Array.from({ length: count }, (_unused, index) =>
      index % EMPTY_FRAME_BYTES === 0 ? 78 : index % EMPTY_FRAME_BYTES === 4 ? 4 : 0,
    );
  }

  test('a 64 KB chunk of thousands of 5-byte frames is read in linear time', () => {
    const frameCount = 13_000;
    const chunk = emptyFrames(frameCount * EMPTY_FRAME_BYTES);
    const reader = createFrameReader();
    const startedAt = performance.now();
    const frames = reader.push(chunk);
    const elapsed = performance.now() - startedAt;
    expect(frames).toHaveLength(frameCount);
    expect(elapsed).toBeLessThan(50);
  });

  test('the cost grows linearly: 100,000 tiny frames in one chunk stay far from quadratic', () => {
    const frameCount = 100_000;
    const chunk = emptyFrames(frameCount * EMPTY_FRAME_BYTES);
    const reader = createFrameReader({ maxFramesPerPush: frameCount });
    const startedAt = performance.now();
    const frames = reader.push(chunk);
    const elapsed = performance.now() - startedAt;
    expect(frames).toHaveLength(frameCount);
    expect(elapsed).toBeLessThan(250);
  });

  test('the remainder after the last whole frame is kept for the next chunk', () => {
    const reader = createFrameReader();
    const whole = Uint8Array.from([...frame('Z', 73), ...frame('C', 'LISTEN', 0)]);
    const cut = whole.length - 3;
    expect(reader.push(whole.slice(0, cut)).map((item) => item.type)).toStrictEqual(['Z']);
    expect(reader.push(whole.slice(cut)).map((item) => item.type)).toStrictEqual(['C']);
  });

  test('more frames than the per-chunk ceiling is a protocol error', () => {
    const reader = createFrameReader({ maxFramesPerPush: 10 });
    expect(reader.push(emptyFrames(10 * EMPTY_FRAME_BYTES))).toHaveLength(10);
    expect(() => reader.push(emptyFrames(11 * EMPTY_FRAME_BYTES))).toThrow();
  });
});

describe('postgres wire decoding', () => {
  test('notification response yields channel and payload', () => {
    const body = bytesOf(...int32(77), 'run_events', 0, '{"a":1}', 0);
    expect(decodeNotification(body)).toStrictEqual({ channel: 'run_events', payload: '{"a":1}' });
  });

  test('notification response with an empty payload is accepted', () => {
    expect(decodeNotification(bytesOf(...int32(1), 'c', 0, 0))).toStrictEqual({
      channel: 'c',
      payload: '',
    });
  });

  test('malformed notification response throws', () => {
    expect(() => decodeNotification(bytesOf(...int32(1), 'sem terminador'))).toThrow();
    expect(() => decodeNotification(bytesOf(...int32(1), 'canal', 0, 'sem fim'))).toThrow();
  });

  test('authentication codes map to kinds', () => {
    expect(decodeAuthentication(bytesOf(...int32(0)))).toStrictEqual({ kind: 'ok' });
    expect(decodeAuthentication(bytesOf(...int32(3)))).toStrictEqual({ kind: 'cleartext' });
    expect(decodeAuthentication(bytesOf(...int32(5), 1, 2, 3, 4))).toStrictEqual({ kind: 'md5' });
    expect(decodeAuthentication(bytesOf(...int32(10), 'SCRAM-SHA-256', 0, 0))).toStrictEqual({
      kind: 'sasl',
      mechanisms: ['SCRAM-SHA-256'],
    });
    expect(decodeAuthentication(bytesOf(...int32(11), 'r=abc'))).toStrictEqual({
      kind: 'sasl-continue',
      data: 'r=abc',
    });
    expect(decodeAuthentication(bytesOf(...int32(12), 'v=xyz'))).toStrictEqual({
      kind: 'sasl-final',
      data: 'v=xyz',
    });
    expect(decodeAuthentication(bytesOf(...int32(7)))).toStrictEqual({
      kind: 'unsupported',
      code: 7,
    });
  });

  test('error response yields only the SQLSTATE, never the message text', () => {
    const body = bytesOf('S', 'FATAL', 0, 'C', '28P01', 0, 'M', 'password for secret-user', 0, 0);
    expect(decodeErrorSqlState(body)).toBe('28P01');
    expect(decodeErrorSqlState(bytesOf(0))).toBeUndefined();
  });
});
