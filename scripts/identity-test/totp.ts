// Copyright (c) 2026 Ada Technology. All rights reserved.
import { createHmac } from 'node:crypto';

const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const COUNTER_BYTE_LENGTH = 8;

export function generateTotpCode(secret: string, atMilliseconds: number): string {
  const counter = Math.floor(atMilliseconds / 1000 / TOTP_PERIOD_SECONDS);
  const counterBuffer = Buffer.alloc(COUNTER_BYTE_LENGTH);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', Buffer.from(secret, 'utf8')).update(counterBuffer).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    (((digest[offset + 1] ?? 0) & 0xff) << 16) |
    (((digest[offset + 2] ?? 0) & 0xff) << 8) |
    ((digest[offset + 3] ?? 0) & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

export function millisecondsUntilNextPeriod(nowMilliseconds: number): number {
  const periodMilliseconds = TOTP_PERIOD_SECONDS * 1000;
  return periodMilliseconds - (nowMilliseconds % periodMilliseconds);
}
