// Copyright (c) 2026 Ada Technology. All rights reserved.
export class IdentityRealmUnavailableError extends Error {
  constructor() {
    super('O realm ou a URL da Admin API do Keycloak não existe: nada é apagado.');
    this.name = 'IdentityRealmUnavailableError';
  }
}
