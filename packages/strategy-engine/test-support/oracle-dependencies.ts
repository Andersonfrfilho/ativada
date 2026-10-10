// Copyright (c) 2026 Ada Technology. All rights reserved.

// Ponte para os oráculos de teste: `decimal.js` e `trading-signals` moram em node_modules do pacote
// e não resolvem a partir de `test/`. Só testes importam este arquivo; `src` nunca.
export { Decimal } from 'decimal.js';
export * as tradingSignals from 'trading-signals';
