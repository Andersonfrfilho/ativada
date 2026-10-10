// Copyright (c) 2026 Ada Technology. All rights reserved.

// Mensagem fixa: nada do que veio do servidor entra no texto do erro.
export class WireProtocolError extends Error {
  constructor() {
    super('Mensagem do servidor Postgres fora do protocolo.');
    this.name = 'WireProtocolError';
  }
}
