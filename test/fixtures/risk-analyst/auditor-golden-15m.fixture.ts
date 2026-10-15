// Copyright (c) 2026 Ada Technology. All rights reserved.

// Dourado do auditor `analyst-1` no recorte REAL de 15 min (T0.2 da spec 007): BTCUSDT 15m, 3.300 velas até
// 2026-10-14 23:45 UTC e o Fear & Greed real do banco de dev; decisão na última vela, janelas de 2.880 e 96.
// Mesmo formato do `auditor-golden`. Regravar: `bun run scripts/risk-analyst-baseline.ts --write-slice` (só leitura).
export const AUDITOR_GOLDEN_15M: Readonly<Record<string, string>> = {
  'btcusdt-15m-3300:trend:2880':
    '2880 0 997 0 908 973 2 922 0.4827 0.4901 even 0.460197658745 0.505316684741 0',
  'btcusdt-15m-3300:trend:96':
    '96 0 37 0 25 34 0 32 0.4237 0.5423 even 0.306125322831 0.550657445272 0',
  'btcusdt-15m-3300:reversion:2880':
    '2880 0 2375 0 260 245 0 257 0.5148 0.5089 even 0.471313888461 0.558164833405 0',
  'btcusdt-15m-3300:reversion:96':
    '96 0 81 0 6 9 0 7 0.4 0.4666 too_few 0.198242280825 0.642535572435 0',
  'btcusdt-15m-3300:volume:2880':
    '2880 0 0 0 1383 1493 4 1447 0.4808 0.5031 below 0.462653347731 0.499150107015 0',
  'btcusdt-15m-3300:volume:96':
    '96 0 0 0 44 52 0 48 0.4583 0.5 even 0.362186823954 0.557686255003 0',
  'btcusdt-15m-3300:sentiment:2880':
    '2880 0 2784 0 54 42 0 42 0.5625 0.4375 even 0.462757020455 0.657433361109 0',
  'btcusdt-15m-3300:sentiment:96': '96 0 96 0 0 0 0 0 null null too_few null null 0',
  'btcusdt-15m-3300:strategy:2880':
    '2880 0 267 0 1241 1369 3 1321 0.4754 0.5061 below 0.456369571853 0.494660360488 0',
  'btcusdt-15m-3300:strategy:96':
    '96 0 5 0 41 50 0 47 0.4505 0.5164 even 0.3523959894 0.552708943457 0',
};
