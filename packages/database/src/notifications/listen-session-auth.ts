// Copyright (c) 2026 Ada Technology. All rights reserved.
import { SESSION_PHASE, type SessionContext } from './listen-session.types.js';
import type { Authentication } from './postgres-wire-decode.js';
import { encodeSaslInitialResponse, encodeSaslResponse } from './postgres-wire-encode.js';
import { createScramClient, ScramError, SCRAM_ERROR_CODE } from './scram-sha-256.js';
import { SESSION_END_REASON, type SessionEndReason } from './session-end.js';

const SCRAM_MECHANISM = 'SCRAM-SHA-256';
const NONCE_BYTES = 18;

export type AuthenticationOutcome = {
  readonly end: (reason: SessionEndReason, sqlState?: string) => void;
};

function failOnScramError(error: unknown, outcome: AuthenticationOutcome): void {
  const isUnsupported =
    error instanceof ScramError && error.code === SCRAM_ERROR_CODE.UNSUPPORTED_PASSWORD;
  outcome.end(
    isUnsupported
      ? SESSION_END_REASON.UNSUPPORTED_AUTHENTICATION
      : SESSION_END_REASON.AUTHENTICATION_FAILED,
  );
}

function startScram(ctx: SessionContext): void {
  const { settings } = ctx.params;
  ctx.scram = createScramClient({
    username: '',
    password: settings.password,
    nonce: crypto.getRandomValues(new Uint8Array(NONCE_BYTES)).toBase64(),
  });
  ctx.transport?.write(
    encodeSaslInitialResponse({
      mechanism: SCRAM_MECHANISM,
      data: ctx.scram.clientFirstMessage,
    }),
  );
  ctx.phase = SESSION_PHASE.AUTHENTICATING;
}

function continueScram(ctx: SessionContext, data: string, outcome: AuthenticationOutcome): void {
  const { scram } = ctx;
  if (scram === undefined) {
    outcome.end(SESSION_END_REASON.PROTOCOL_ERROR);
    return;
  }
  scram.respondToServerFirst(data).then(
    (clientFinal) => ctx.transport?.write(encodeSaslResponse(clientFinal)),
    (error: unknown) => failOnScramError(error, outcome),
  );
}

function finishScram(ctx: SessionContext, data: string, outcome: AuthenticationOutcome): void {
  try {
    ctx.scram?.verifyServerFinal(data);
  } catch (error: unknown) {
    failOnScramError(error, outcome);
  }
}

// Só SCRAM-SHA-256 e `trust`: a senha em texto puro ou em MD5 nunca é enviada.
export function handleAuthentication(
  ctx: SessionContext,
  authentication: Authentication,
  outcome: AuthenticationOutcome,
): void {
  if (authentication.kind === 'ok') {
    ctx.phase = SESSION_PHASE.AWAITING_READY;
  } else if (authentication.kind === 'sasl') {
    if (authentication.mechanisms.includes(SCRAM_MECHANISM)) startScram(ctx);
    else outcome.end(SESSION_END_REASON.UNSUPPORTED_AUTHENTICATION);
  } else if (authentication.kind === 'sasl-continue') {
    continueScram(ctx, authentication.data, outcome);
  } else if (authentication.kind === 'sasl-final') {
    finishScram(ctx, authentication.data, outcome);
  } else {
    outcome.end(SESSION_END_REASON.UNSUPPORTED_AUTHENTICATION);
  }
}
