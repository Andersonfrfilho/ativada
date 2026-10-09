// Copyright (c) 2026 Ada Technology. All rights reserved.
import { runWithEnvironment } from '@crypto/environment';
import { loadEnvironment, type Environment } from './environment.js';
import { WORKSPACE_NAME } from './index.js';

function writeStartupLog(environment: Environment): void {
  process.stdout.write(
    `${JSON.stringify({ level: 'info', app: WORKSPACE_NAME, message: 'environment valid', env: environment.ENV })}\n`,
  );
}

runWithEnvironment({ appName: WORKSPACE_NAME, load: loadEnvironment, run: writeStartupLog });
