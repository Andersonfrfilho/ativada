// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { OutputFloor } from './oracle-comparison.fixture.js';
import type { OracleCandle } from './oracle-decimal.fixture.js';
import { cumulativeVolumeAt } from './oracle-volume.fixture.js';

// Piso do erro relativo das saídas que cruzam o zero (ADR 0002, "Tolerâncias"): o erro absoluto é do
// tamanho do ε de máquina vezes o operando, e dividi-lo por um valor perto de zero mediria
// cancelamento, não erro.
const MACD_OUTPUTS: readonly string[] = ['macd', 'signal', 'histogram'];
const UNIT_FLOOR = 1;

export function macdFloor(candles: readonly OracleCandle[]): OutputFloor {
  return ({ output, index }) =>
    MACD_OUTPUTS.includes(output) ? (candles[index]?.close.abs().toNumber() ?? 0) : 0;
}

export function zScoreFloor(): OutputFloor {
  return () => UNIT_FLOOR;
}

export function obvFloor(candles: readonly OracleCandle[]): OutputFloor {
  return ({ index }) => cumulativeVolumeAt(candles, index).toNumber();
}
