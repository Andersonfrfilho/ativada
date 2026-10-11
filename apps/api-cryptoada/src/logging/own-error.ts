// Copyright (c) 2026 Ada Technology. All rights reserved.
import { AppError } from '../shared/errors/app.error.js';

// Erros que o próprio código monta: a mensagem é texto nosso e pode sair no log. Qualquer outro erro (fetch, driver, biblioteca)
// pode citar URL com token, SQL ou dado de usuário na mensagem, no stack ou na causa.
const OWN_ERROR_CLASSES: readonly (abstract new (...parameters: never[]) => Error)[] = [AppError];

export function isOwnError(error: Error): boolean {
  return OWN_ERROR_CLASSES.some((ownClass) => error instanceof ownClass);
}

export function readErrorCode(error: Error): string | undefined {
  if (!('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}
