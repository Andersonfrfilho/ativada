// Copyright (c) 2026 Ada Technology. All rights reserved.

export class EnvironmentError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Variáveis de ambiente inválidas:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'EnvironmentError';
    this.issues = issues;
  }
}
