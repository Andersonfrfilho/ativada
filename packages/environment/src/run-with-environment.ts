// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EnvironmentError } from './environment.error.js';

export type RunWithEnvironmentOptions<TEnvironment> = {
  readonly appName: string;
  readonly load: () => TEnvironment;
  readonly run: (environment: TEnvironment) => void;
};

export function runWithEnvironment<TEnvironment>(
  options: RunWithEnvironmentOptions<TEnvironment>,
): void {
  let environment: TEnvironment;
  try {
    environment = options.load();
  } catch (error) {
    if (!(error instanceof EnvironmentError)) throw error;
    process.stderr.write(`${options.appName}: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  options.run(environment);
}
