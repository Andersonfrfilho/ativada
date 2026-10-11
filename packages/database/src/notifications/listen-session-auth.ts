// Copyright (c) 2026 Ada Technology. All rights reserved.
import { SESSION_PHASE, type SessionContext } from './listen-session.types.js';
import type { Authentication } from './postgres-wire-decode.js';
import { encodeSaslInitialResponse, encodeSaslResponse } from './postgres-wire-encode.js';
import {
  createScramClient,
  ScramError,
  SCRAM_ERROR_CODE,
  type ChannelBinding,
} from './scram-sha-256.js';
import { SESSION_END_REASON, type SessionEndReason } from './session-end.js';

const SCRAM_MECHANISM = 'SCRAM-SHA-256';
const SCRAM_PLUS_MECHANISM = 'SCRAM-SHA-256-PLUS';
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

type ScramChoice = { readonly mechanism: string; readonly binding: ChannelBinding };

// Com TLS e o hash do certificado em mãos, prefere -PLUS (a prova fica presa a ESTE canal). Se o servidor não o oferece,
// declara `y,,` (suportamos, você não ofereceu) para que um servidor que o suporta denuncie um rebaixamento. Sem hash
// (sem TLS, ou assinatura que não sabemos mapear), segue o mecanismo comum sem ligação ao canal.
function chooseScram(ctx: SessionContext, offered: readonly string[]): ScramChoice | undefined {
  const hash = ctx.channelBindingHash;
  if (hash !== undefined && offered.includes(SCRAM_PLUS_MECHANISM)) {
    return {
      mechanism: SCRAM_PLUS_MECHANISM,
      binding: { mode: 'tls-server-end-point', data: hash },
    };
  }
  if (!offered.includes(SCRAM_MECHANISM)) return undefined;
  const mode = hash === undefined ? 'none' : 'unsupported-by-server';
  return { mechanism: SCRAM_MECHANISM, binding: { mode } };
}

function startScram(ctx: SessionContext, choice: ScramChoice): void {
  const { settings } = ctx.params;
  ctx.scram = createScramClient({
    username: '',
    password: settings.password,
    nonce: crypto.getRandomValues(new Uint8Array(NONCE_BYTES)).toBase64(),
    channelBinding: choice.binding,
  });
  ctx.transport?.write(
    encodeSaslInitialResponse({
      mechanism: choice.mechanism,
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
    ctx.isServerVerified = true;
  } catch (error: unknown) {
    failOnScramError(error, outcome);
  }
}

// Como o `require_auth` do libpq: com senha configurada, o `ok` só vale depois de o servidor provar quem é (SASLFinal
// verificado); um `ok` sem SASL, ou com SASL sem prova, é um servidor que dispensa a senha que deveria exigir.
function acceptAuthenticationOk(ctx: SessionContext, outcome: AuthenticationOutcome): void {
  const isProven =
    ctx.scram === undefined ? ctx.params.settings.password.length === 0 : ctx.isServerVerified;
  if (!isProven) {
    outcome.end(SESSION_END_REASON.AUTHENTICATION_FAILED);
    return;
  }
  ctx.phase = SESSION_PHASE.AWAITING_READY;
}

// Só SCRAM-SHA-256 e `trust` sem senha: a senha em texto puro ou em MD5 nunca é enviada.
export function handleAuthentication(
  ctx: SessionContext,
  authentication: Authentication,
  outcome: AuthenticationOutcome,
): void {
  if (authentication.kind === 'ok') {
    acceptAuthenticationOk(ctx, outcome);
  } else if (authentication.kind === 'sasl') {
    const choice = chooseScram(ctx, authentication.mechanisms);
    if (choice !== undefined) startScram(ctx, choice);
    else outcome.end(SESSION_END_REASON.UNSUPPORTED_AUTHENTICATION);
  } else if (authentication.kind === 'sasl-continue') {
    continueScram(ctx, authentication.data, outcome);
  } else if (authentication.kind === 'sasl-final') {
    finishScram(ctx, authentication.data, outcome);
  } else {
    outcome.end(SESSION_END_REASON.UNSUPPORTED_AUTHENTICATION);
  }
}
