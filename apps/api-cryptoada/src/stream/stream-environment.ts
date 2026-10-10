// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MILLISECONDS_PER_SECOND, z } from '@cryptoada/environment';

const SOCKETS_EXPECTATION = 'inteiro entre 1 e 50';
const MESSAGE_BYTES_EXPECTATION = 'inteiro entre 256 e 65536';
const PING_EXPECTATION = 'inteiro de segundos entre 5 e 120';
const PONG_EXPECTATION =
  'inteiro de segundos entre 10 e 600, maior que STREAM_PING_INTERVAL_SECONDS';
const MESSAGES_EXPECTATION = 'inteiro entre 10 e 600';

export const PONG_AFTER_PING_EXPECTATION = PONG_EXPECTATION;

function boundedInteger(params: {
  readonly expectation: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly fallback: number;
}): z.ZodDefault<z.ZodCoercedNumber> {
  return z.coerce
    .number({ error: params.expectation })
    .int({ error: params.expectation })
    .min(params.minimum, { error: params.expectation })
    .max(params.maximum, { error: params.expectation })
    .default(params.fallback);
}

// Tetos do WebSocket de tempo real (RF00b, ADR 0001 §e): sockets por usuário, tamanho e ritmo de mensagem, ping e pong.
export const streamEnvironmentShape = {
  STREAM_MAX_SOCKETS_PER_USER: boundedInteger({
    expectation: SOCKETS_EXPECTATION,
    minimum: 1,
    maximum: 50,
    fallback: 5,
  }),
  STREAM_MAX_MESSAGE_BYTES: boundedInteger({
    expectation: MESSAGE_BYTES_EXPECTATION,
    minimum: 256,
    maximum: 65_536,
    fallback: 4_096,
  }),
  STREAM_PING_INTERVAL_SECONDS: boundedInteger({
    expectation: PING_EXPECTATION,
    minimum: 5,
    maximum: 120,
    fallback: 20,
  }),
  STREAM_PONG_TIMEOUT_SECONDS: boundedInteger({
    expectation: PONG_EXPECTATION,
    minimum: 10,
    maximum: 600,
    fallback: 60,
  }),
  STREAM_MAX_MESSAGES_PER_MINUTE: boundedInteger({
    expectation: MESSAGES_EXPECTATION,
    minimum: 10,
    maximum: 600,
    fallback: 60,
  }),
} as const;

export type StreamEnvironmentValues = {
  readonly STREAM_MAX_SOCKETS_PER_USER: number;
  readonly STREAM_MAX_MESSAGE_BYTES: number;
  readonly STREAM_PING_INTERVAL_SECONDS: number;
  readonly STREAM_PONG_TIMEOUT_SECONDS: number;
  readonly STREAM_MAX_MESSAGES_PER_MINUTE: number;
};

export function isPongTimeoutAfterPingInterval(values: StreamEnvironmentValues): boolean {
  return values.STREAM_PONG_TIMEOUT_SECONDS > values.STREAM_PING_INTERVAL_SECONDS;
}

export type StreamLimits = {
  readonly maxSocketsPerUser: number;
  readonly maxMessageBytes: number;
  readonly pongTimeoutMilliseconds: number;
  readonly maxMessagesPerMinute: number;
};

export function toStreamLimits(values: StreamEnvironmentValues): StreamLimits {
  return {
    maxSocketsPerUser: values.STREAM_MAX_SOCKETS_PER_USER,
    maxMessageBytes: values.STREAM_MAX_MESSAGE_BYTES,
    pongTimeoutMilliseconds: values.STREAM_PONG_TIMEOUT_SECONDS * MILLISECONDS_PER_SECOND,
    maxMessagesPerMinute: values.STREAM_MAX_MESSAGES_PER_MINUTE,
  };
}
