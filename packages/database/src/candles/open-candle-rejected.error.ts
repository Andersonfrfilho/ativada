// Copyright (c) 2026 Ada Technology. All rights reserved.
export class OpenCandleRejectedError extends Error {
  constructor(readonly openTime: number) {
    super(`Candle com open_time ${openTime} ainda não fechou e não pode ser gravado`);
    this.name = 'OpenCandleRejectedError';
  }
}
