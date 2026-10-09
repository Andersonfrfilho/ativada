// Copyright (c) 2026 Ada Technology. All rights reserved.
import { MILLISECONDS_PER_SECOND } from '@crypto/environment';

import {
  CLOCK_TOLERANCE_SECONDS,
  RECENT_AUTHENTICATION_MAX_AGE_SECONDS,
} from './authentication.constant.js';
import { ReauthenticationRequiredError } from './authentication.error.js';

export type RecentAuthenticationParams = {
  readonly authenticationTime: number | undefined;
  readonly nowMilliseconds: number;
};

// auth_time ausente é recusa: sem a data do último login a API não prova que a pessoa acabou de entrar.
export function assertRecentAuthentication(params: RecentAuthenticationParams): void {
  if (params.authenticationTime === undefined) throw new ReauthenticationRequiredError();
  const ageSeconds = params.nowMilliseconds / MILLISECONDS_PER_SECOND - params.authenticationTime;
  const isFromTheFuture = ageSeconds < -CLOCK_TOLERANCE_SECONDS;
  const isTooOld = ageSeconds > RECENT_AUTHENTICATION_MAX_AGE_SECONDS + CLOCK_TOLERANCE_SECONDS;
  if (isFromTheFuture || isTooOld) throw new ReauthenticationRequiredError();
}
