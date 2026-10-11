// Copyright (c) 2026 Ada Technology. All rights reserved.
export const SENTIMENT_PATH = '/v1/market/sentiment';

// Crédito exigido pelos termos da alternative.me (RF01, plan D14): vem da API para que toda tela use o mesmo texto e o mesmo link.
export const SENTIMENT_SOURCE = {
  name: 'alternative.me',
  creditText: 'Fear & Greed Index por alternative.me',
  url: 'https://alternative.me/crypto/fear-and-greed-index/',
} as const;
