// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  FRONTEND_MESSAGE,
  INT32_BYTES,
  NULL_BYTE,
  PROTOCOL_VERSION_3,
  SSL_REQUEST_CODE,
} from './postgres-wire.constant.js';

const TEXT_ENCODER = new TextEncoder();
const STARTUP_HEADER_BYTES = 2 * INT32_BYTES;

function int32(value: number): Uint8Array {
  const bytes = new Uint8Array(INT32_BYTES);
  new DataView(bytes.buffer).setInt32(0, value);
  return bytes;
}

function cString(text: string): Uint8Array {
  return Uint8Array.from([...TEXT_ENCODER.encode(text), NULL_BYTE]);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function frame(type: string, body: Uint8Array): Uint8Array {
  return concat([TEXT_ENCODER.encode(type), int32(body.length + INT32_BYTES), body]);
}

export function encodeSslRequest(): Uint8Array {
  return concat([int32(STARTUP_HEADER_BYTES), int32(SSL_REQUEST_CODE)]);
}

export type StartupParams = {
  readonly user: string;
  readonly database: string;
  readonly applicationName: string;
};

export function encodeStartup(params: StartupParams): Uint8Array {
  const pairs = [
    cString('user'),
    cString(params.user),
    cString('database'),
    cString(params.database),
    cString('application_name'),
    cString(params.applicationName),
    Uint8Array.of(NULL_BYTE),
  ];
  const body = concat(pairs);
  return concat([int32(STARTUP_HEADER_BYTES + body.length), int32(PROTOCOL_VERSION_3), body]);
}

export function encodeQuery(text: string): Uint8Array {
  return frame(FRONTEND_MESSAGE.QUERY, cString(text));
}

export type SaslInitialParams = { readonly mechanism: string; readonly data: string };

export function encodeSaslInitialResponse(params: SaslInitialParams): Uint8Array {
  const data = TEXT_ENCODER.encode(params.data);
  return frame(
    FRONTEND_MESSAGE.PASSWORD,
    concat([cString(params.mechanism), int32(data.length), data]),
  );
}

export function encodeSaslResponse(data: string): Uint8Array {
  return frame(FRONTEND_MESSAGE.PASSWORD, TEXT_ENCODER.encode(data));
}

export function encodeTerminate(): Uint8Array {
  return frame(FRONTEND_MESSAGE.TERMINATE, new Uint8Array(0));
}
