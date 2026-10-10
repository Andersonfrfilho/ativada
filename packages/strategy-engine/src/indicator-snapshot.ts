// Copyright (c) 2026 Ada Technology. All rights reserved.
import { refuseIndicator } from './indicator-input.js';
import type { JsonValue } from './json-value.types.js';
import { INDICATOR_ERROR_CODE } from './strategy-engine.error.js';

// Chave do fechamento anterior no snapshot de RSI, ATR e OBV.
export const PREVIOUS_CLOSE_KEY = 'previousClose';

export type SnapshotRecord = Readonly<Record<string, JsonValue>>;

function refuseSnapshot(message: string): never {
  return refuseIndicator(INDICATOR_ERROR_CODE.INVALID_SNAPSHOT, message);
}

export function readRecord(snapshot: JsonValue | undefined): SnapshotRecord {
  if (typeof snapshot !== 'object' || snapshot === null || Array.isArray(snapshot)) {
    return refuseSnapshot('Snapshot de indicador precisa ser um objeto.');
  }
  return snapshot as SnapshotRecord;
}

function isFiniteNumber(value: JsonValue | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function readNumber(record: SnapshotRecord, key: string): number {
  const value = record[key];
  if (!isFiniteNumber(value)) return refuseSnapshot(`Snapshot: ${key} precisa ser número finito.`);
  return value;
}

export function readNullableNumber(record: SnapshotRecord, key: string): number | null {
  const value = record[key];
  if (value === null) return null;
  return readNumber(record, key);
}

export type ReadNumberArrayParams = {
  readonly record: SnapshotRecord;
  readonly key: string;
  readonly maximumLength: number;
};

export function readNumberArray(params: ReadNumberArrayParams): readonly number[] {
  const value = params.record[params.key];
  if (!Array.isArray(value) || value.length > params.maximumLength) {
    return refuseSnapshot(
      `Snapshot: ${params.key} precisa ser lista de até ${params.maximumLength}.`,
    );
  }
  const members: readonly JsonValue[] = value;
  if (!members.every(isFiniteNumber)) {
    return refuseSnapshot(`Snapshot: ${params.key} precisa conter só números finitos.`);
  }
  return members;
}
