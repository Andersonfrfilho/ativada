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

export class MarketDataHttpError extends MarketDataError {
  readonly status: number;

  constructor(status: number, attempts: number) {
    super(`Binance respondeu HTTP ${status} após ${attempts} tentativa(s).`);
    this.status = status;
  }
}

export class MarketDataRateLimitError extends MarketDataError {
  readonly retryAfterSeconds: number | undefined;

  constructor(retryAfterSeconds: number | undefined) {
    super('Binance limitou a taxa de requisições (HTTP 429) e as tentativas acabaram.');
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// HTTP 418: IP banido. Insistir prolonga o banimento, então nunca há retry.
export class MarketDataBannedError extends MarketDataError {
  readonly retryAfterSeconds: number | undefined;

  constructor(retryAfterSeconds: number | undefined) {
    super('Binance baniu o IP (HTTP 418); nenhuma nova tentativa foi feita.');
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
