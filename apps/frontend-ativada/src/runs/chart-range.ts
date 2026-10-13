// Copyright (c) 2026 Ada Technology. All rights reserved.

// Faixa em milissegundos UTC, semiaberta: `from` entra e `to` não (o mesmo contrato do `/chart`).
export type ChartRange = {
  readonly from: number;
  readonly to: number;
};
