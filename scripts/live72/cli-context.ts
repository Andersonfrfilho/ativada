// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  readIdentityEnvironment,
  type IdentityEnvironment,
} from '../identity-test/identity-environment.js';
import {
  apiBaseUrl,
  loadLive72Environment,
  resolveLive72Paths,
  type Live72Environment,
  type Live72Paths,
} from './live72-environment.js';
import type { Live72Credentials } from './identity-session.js';

export type CliContext = {
  readonly environment: Live72Environment;
  readonly paths: Live72Paths;
  readonly identity: IdentityEnvironment;
  readonly apiUrl: string;
  readonly credentials: Live72Credentials;
};

export function createCliContext(): CliContext {
  const environment = loadLive72Environment();
  return {
    environment,
    paths: resolveLive72Paths(environment),
    identity: readIdentityEnvironment(),
    apiUrl: apiBaseUrl(environment),
    credentials: {
      username: environment.LIVE72_USERNAME,
      email: environment.LIVE72_USER_EMAIL,
      password: environment.LIVE72_USER_PASSWORD,
    },
  };
}
