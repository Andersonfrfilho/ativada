// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal } from '@ativada/strategy-engine';

const PERCENT_FACTOR = 100;
const PERCENT_DECIMAL_PLACES = 1;

// Taxa em texto decimal exato vira porcentagem com uma casa e vírgula: o número nunca passa por float.
export function formatPercent(rate: string): string {
  const percent = new EngineDecimal(rate).times(PERCENT_FACTOR);
  return `${percent.toFixed(PERCENT_DECIMAL_PLACES, EngineDecimal.ROUND_HALF_UP).replace('.', ',')}%`;
}

// O resultado de uma simulação mostra o sinal: "+3,5%" ou "-5,0%".
export function formatSignedPercent(rate: string): string {
  const text = formatPercent(rate);
  return text.startsWith('-') || new EngineDecimal(rate).isZero() ? text : `+${text}`;
}
