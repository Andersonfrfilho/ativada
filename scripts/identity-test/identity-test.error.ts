// Copyright (c) 2026 Ada Technology. All rights reserved.

export class IdentityTestError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'IdentityTestError';
  }
}

export function assertCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new IdentityTestError(message);
}
