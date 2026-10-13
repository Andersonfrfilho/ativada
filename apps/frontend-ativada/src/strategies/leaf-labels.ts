// Copyright (c) 2026 Ada Technology. All rights reserved.
const STATIC_LABEL: Readonly<Record<string, string>> = {
  'thresholds.buy': 'Limiar de compra',
  'thresholds.sell': 'Limiar de venda',
  'risk.atrPeriod': 'Período do ATR',
  'risk.stopAtrMultiple': 'Stop (múltiplo do ATR)',
  'risk.targetAtrMultiple': 'Alvo (múltiplo do ATR)',
  'risk.riskPerTrade': 'Risco por operação (fração do saldo)',
  'risk.maxExposureRate': 'Exposição máxima (fração do saldo)',
  'regime.period': 'Período do ADX',
  'regime.trendThreshold': 'ADX mínimo para tendência',
  'entry.offsetRate': 'Afastamento da ordem limite',
  'entry.expiryCandles': 'Validade da ordem (velas)',
};

const RULE_FIELD_LABEL: Readonly<Record<string, string>> = {
  fastPeriod: 'período rápido',
  slowPeriod: 'período lento',
  signalPeriod: 'período do sinal',
  period: 'período',
  oversold: 'sobrevendido abaixo de',
  overbought: 'sobrecomprado acima de',
  deviations: 'desvios',
  emaPeriod: 'período da EMA',
  fearAtOrBelow: 'medo em até',
  greedAtOrAbove: 'ganância a partir de',
};

const REGIME_NAME: Readonly<Record<string, string>> = { trending: 'tendência', ranging: 'lateral' };
const FAMILY_NAME: Readonly<Record<string, string>> = {
  trend: 'tendência',
  reversion: 'reversão',
  volume: 'volume',
  sentiment: 'sentimento',
};

export const RULE_FIELDS: readonly string[] = Object.keys(RULE_FIELD_LABEL);
// O catálogo do walk-forward (o mesmo da API): os campos estáticos acima e os campos de regra.
export const STATIC_TUNABLE_KEYS: readonly string[] = Object.keys(STATIC_LABEL);

// 'ema-9-21' → "EMA 9 x 21"; os demais ids viram o próprio texto em maiúsculas ("RSI 14").
export function ruleTitle(ruleId: string): string {
  const ema = /^ema-(\d+)-(\d+)$/.exec(ruleId);
  if (ema !== null) return `EMA ${ema[1]} x ${ema[2]}`;
  return ruleId.replaceAll('-', ' ').toUpperCase();
}

export function labelForKey(key: string): string {
  const fixed = STATIC_LABEL[key];
  if (fixed !== undefined) return fixed;
  const [section, first, second, third] = key.split('.');
  if (section === 'rules' && first !== undefined && second !== undefined) {
    return `${ruleTitle(first)}: ${RULE_FIELD_LABEL[second] ?? second}`;
  }
  if (section === 'regime' && first === 'weights' && second !== undefined && third !== undefined) {
    return `Peso em ${REGIME_NAME[second] ?? second}: ${FAMILY_NAME[third] ?? third}`;
  }
  return key;
}
