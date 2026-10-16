// Copyright (c) 2026 Ada Technology. All rights reserved.
const PAIR_PATTERN = /^([A-Z0-9]{2,12})(USDT)$/;
const TRADE_URL = 'https://www.binance.com/pt-BR/trade';

// O link do par na Binance (D13-A): SÓ o par, montado de um símbolo de lista fechada. Nenhum dado da pessoa vai na URL
// (preço, quantidade, saldo): a Binance não documenta link com ordem montada. O app nunca envia ordem.
export function buildExchangeUrl(symbol: string): string | undefined {
  const match = PAIR_PATTERN.exec(symbol);
  if (match === null) return undefined;
  return `${TRADE_URL}/${match[1]}_${match[2]}`;
}
