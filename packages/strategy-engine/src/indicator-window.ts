// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readNumberArray, readRecord } from './indicator-snapshot.js';
import type { JsonValue } from './json-value.types.js';

export type WindowState = { readonly window: readonly number[] };

export const EMPTY_WINDOW_STATE: WindowState = { window: [] };

export type ParseWindowParams = {
  readonly snapshot: JsonValue;
  readonly period: number;
};

export function parseWindowState(params: ParseWindowParams): WindowState {
  const record = readRecord(params.snapshot);
  return { window: readNumberArray({ record, key: 'window', maximumLength: params.period }) };
}
