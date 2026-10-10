// Copyright (c) 2026 Ada Technology. All rights reserved.
export const UNKNOWN_ERROR_NAME = 'UnknownError';

export function readErrorName(error: unknown): string {
  return error instanceof Error ? error.name : UNKNOWN_ERROR_NAME;
}
