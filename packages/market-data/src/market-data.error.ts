// Copyright (c) 2026 Ada Technology. All rights reserved.

export class MarketDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class MarketDataInvalidRequestError extends MarketDataError {}

// A mensagem descreve o formato quebrado, nunca o corpo recebido.
export class MarketDataResponseError extends MarketDataError {}

export class MarketDataTimeoutError extends MarketDataError {}

export class MarketDataNetworkError extends MarketDataError {}

// Falha declarada pela própria fonte (ex.: `metadata.error` da alternative.me); a mensagem dela nunca é repetida.
export class MarketDataSourceError extends MarketDataError {}

export class MarketDataHttpError extends MarketDataError {
  readonly status: number;

  constructor(params: {
    readonly status: number;
    readonly attempts: number;
    readonly sourceName: string;
  }) {
    super(
      `${params.sourceName} respondeu HTTP ${params.status} após ${params.attempts} tentativa(s).`,
    );
    this.status = params.status;
  }
}

export class MarketDataRateLimitError extends MarketDataError {
  readonly retryAfterSeconds: number | undefined;

  constructor(retryAfterSeconds: number | undefined, sourceName: string) {
    super(`${sourceName} limitou a taxa de requisições (HTTP 429) e as tentativas acabaram.`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// HTTP 418: IP banido. Insistir prolonga o banimento, então nunca há retry.
export class MarketDataBannedError extends MarketDataError {
  readonly retryAfterSeconds: number | undefined;

  constructor(retryAfterSeconds: number | undefined, sourceName: string) {
    super(`${sourceName} baniu o IP (HTTP 418); nenhuma nova tentativa foi feita.`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
