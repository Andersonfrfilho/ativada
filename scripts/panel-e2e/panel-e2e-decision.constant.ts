// Copyright (c) 2026 Ada Technology. All rights reserved.
// Os votos e as leituras de uma vela de ESPERAR da estratégia do seed (Placar clássico: EMA 9×21, MACD, RSI e OBV).
export const DECISION_VOTES = [
  { ruleId: 'ema-9-21', family: 'trend', vote: 0, weight: '1.5', isMissing: false },
  { ruleId: 'macd-12-26-9', family: 'trend', vote: 0, weight: '1.5', isMissing: false },
  { ruleId: 'rsi-14', family: 'reversion', vote: 0, weight: '0.5', isMissing: false },
  { ruleId: 'obv-ema-20', family: 'volume', vote: 0, weight: '1', isMissing: false },
] as const;

export const DECISION_INDICATORS = {
  'rule:ema-9-21.fast': 61480.5,
  'rule:ema-9-21.slow': 61492,
  'rule:macd-12-26-9.macd': -0.4,
  'rule:macd-12-26-9.signal': -0.2,
  'rule:macd-12-26-9.histogram': -0.2,
  'rule:rsi-14': 55,
  'rule:obv-ema-20.obv': -1200,
  'rule:obv-ema-20.ema': -900,
  'risk:atr': 120,
  'regime:adx.adx': 18,
  'regime:adx.plusDi': 15,
  'regime:adx.minusDi': 20,
} as const;

const VOTE_RULES = [
  ['ema-9-21', 'trend', '1.5'],
  ['macd-12-26-9', 'trend', '1.5'],
  ['rsi-14', 'reversion', '0.5'],
  ['obv-ema-20', 'volume', '1'],
] as const;

// Todas as regras votando igual (compra: 1, venda: -1): o sinal gravado que a rota de decisões lê.
export function votesFor(vote: 1 | -1): readonly object[] {
  return VOTE_RULES.map(([ruleId, family, weight]) => ({
    ruleId,
    family,
    vote,
    weight,
    isMissing: false,
  }));
}
