// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  AUTHENTICATION_CODE,
  DEFAULT_MAX_FRAME_BYTES,
  DEFAULT_MAX_FRAMES_PER_PUSH,
  ERROR_FIELD_SQLSTATE,
  ERROR_FIELD_TERMINATOR,
  FRAME_HEADER_BYTES,
  INT32_BYTES,
  NULL_BYTE,
} from './postgres-wire.constant.js';
import { WireProtocolError } from './postgres-wire.error.js';

const TEXT_DECODER = new TextDecoder();

export type WireFrame = { readonly type: string; readonly body: Uint8Array };

export type FrameReaderOptions = {
  readonly maxFrameBytes?: number;
  readonly maxFramesPerPush?: number;
};

export type FrameReader = { readonly push: (chunk: Uint8Array) => readonly WireFrame[] };

function appendChunk(pending: Uint8Array, chunk: Uint8Array): Uint8Array {
  if (pending.length === 0) return chunk;
  const joined = new Uint8Array(pending.length + chunk.length);
  joined.set(pending, 0);
  joined.set(chunk, pending.length);
  return joined;
}

// O tamanho declarado é conferido antes de qualquer espera: um servidor hostil não faz o processo acumular memória.
// Lê por deslocamento e corta o resto uma única vez no fim, e o teto de quadros por leitura limita o trabalho de um
// pedaço cheio de quadros mínimos.
export function createFrameReader(options: FrameReaderOptions = {}): FrameReader {
  const maxFrameBytes = options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES;
  const maxFramesPerPush = options.maxFramesPerPush ?? DEFAULT_MAX_FRAMES_PER_PUSH;
  let pending: Uint8Array = new Uint8Array(0);
  return {
    push: (chunk): readonly WireFrame[] => {
      const buffer = appendChunk(pending, chunk);
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const frames: WireFrame[] = [];
      let offset = 0;
      while (buffer.length - offset >= FRAME_HEADER_BYTES) {
        const length = view.getInt32(offset + 1);
        if (length < INT32_BYTES || length > maxFrameBytes) throw new WireProtocolError();
        const end = offset + 1 + length;
        if (end > buffer.length) break;
        if (frames.length >= maxFramesPerPush) throw new WireProtocolError();
        frames.push({
          type: String.fromCharCode(buffer[offset] ?? NULL_BYTE),
          body: buffer.slice(offset + FRAME_HEADER_BYTES, end),
        });
        offset = end;
      }
      pending = buffer.slice(offset);
      return frames;
    },
  };
}

export type Authentication =
  | { readonly kind: 'ok' }
  | { readonly kind: 'cleartext' }
  | { readonly kind: 'md5' }
  | { readonly kind: 'sasl'; readonly mechanisms: readonly string[] }
  | { readonly kind: 'sasl-continue'; readonly data: string }
  | { readonly kind: 'sasl-final'; readonly data: string }
  | { readonly kind: 'unsupported'; readonly code: number };

function readCode(body: Uint8Array): number {
  if (body.length < INT32_BYTES) throw new WireProtocolError();
  return new DataView(body.buffer, body.byteOffset, body.byteLength).getInt32(0);
}

function readMechanisms(rest: Uint8Array): readonly string[] {
  return TEXT_DECODER.decode(rest)
    .split(String.fromCharCode(NULL_BYTE))
    .filter((name) => name.length > 0);
}

export function decodeAuthentication(body: Uint8Array): Authentication {
  const code = readCode(body);
  const rest = body.slice(INT32_BYTES);
  if (code === AUTHENTICATION_CODE.OK) return { kind: 'ok' };
  if (code === AUTHENTICATION_CODE.CLEARTEXT_PASSWORD) return { kind: 'cleartext' };
  if (code === AUTHENTICATION_CODE.MD5_PASSWORD) return { kind: 'md5' };
  if (code === AUTHENTICATION_CODE.SASL) return { kind: 'sasl', mechanisms: readMechanisms(rest) };
  if (code === AUTHENTICATION_CODE.SASL_CONTINUE) {
    return { kind: 'sasl-continue', data: TEXT_DECODER.decode(rest) };
  }
  if (code === AUTHENTICATION_CODE.SASL_FINAL) {
    return { kind: 'sasl-final', data: TEXT_DECODER.decode(rest) };
  }
  return { kind: 'unsupported', code };
}

export type Notification = { readonly channel: string; readonly payload: string };

// Corpo: pid (4 bytes), canal e payload, cada um terminado em zero.
export function decodeNotification(body: Uint8Array): Notification {
  const channelEnd = body.indexOf(NULL_BYTE, INT32_BYTES);
  if (channelEnd < 0) throw new WireProtocolError();
  const payloadEnd = body.indexOf(NULL_BYTE, channelEnd + 1);
  if (payloadEnd < 0) throw new WireProtocolError();
  return {
    channel: TEXT_DECODER.decode(body.slice(INT32_BYTES, channelEnd)),
    payload: TEXT_DECODER.decode(body.slice(channelEnd + 1, payloadEnd)),
  };
}

// Só o SQLSTATE sai: o texto da mensagem do servidor pode citar usuário, banco ou consulta.
export function decodeErrorSqlState(body: Uint8Array): string | undefined {
  let offset = 0;
  while (offset < body.length && body[offset] !== ERROR_FIELD_TERMINATOR) {
    const field = String.fromCharCode(body[offset] ?? NULL_BYTE);
    const end = body.indexOf(NULL_BYTE, offset + 1);
    if (end < 0) return undefined;
    if (field === ERROR_FIELD_SQLSTATE) return TEXT_DECODER.decode(body.slice(offset + 1, end));
    offset = end + 1;
  }
  return undefined;
}
