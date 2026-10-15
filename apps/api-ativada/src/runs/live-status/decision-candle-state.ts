// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { PositionInput } from '@ativada/database';
import { EXIT_REASON } from '@ativada/strategy-engine';

// O que a carteira viveu na vela de uma decisão, lido só das posições já em memória (ADR 0002, spec 008, L12 e L21).
export type CandleState = {
  // Comprada ao fechar a vela.
  readonly isHolding: boolean;
  // Existe a posição aberta na abertura da vela seguinte: o pedido de compra preencheu.
  readonly isBuyFilled: boolean;
  // É a última vela decidida: a vela seguinte ainda não abriu para a compra preencher.
  readonly isLastCandle: boolean;
  // A posição que saiu nesta vela por alvo, stop, lacuna ou comando (sinal de venda não entra).
  readonly exit: PositionInput | undefined;
};

export type CandleStateParams = {
  readonly positions: readonly PositionInput[];
  readonly candleTime: number;
  readonly durationMilliseconds: number;
  readonly lastCandleTime: number | undefined;
};

// Comprada ao fechar a vela `candleTime`: a compra preenche na abertura da vela seguinte (`openedCandleTime`) e a saída
// ocupa a vela em que preenche (`closedCandleTime`), então "aberta antes ou nela e fechada depois dela" (ADR 0002, L12).
export function isHoldingAt(positions: readonly PositionInput[], candleTime: number): boolean {
  return positions.some(
    (position) =>
      position.openedCandleTime <= candleTime &&
      (position.closedCandleTime === undefined || position.closedCandleTime > candleTime),
  );
}

function findExitAt(
  positions: readonly PositionInput[],
  candleTime: number,
): PositionInput | undefined {
  return positions.find(
    (position) =>
      position.closedCandleTime === candleTime &&
      position.exitReason !== undefined &&
      position.exitReason !== EXIT_REASON.SIGNAL,
  );
}

export function readCandleState(params: CandleStateParams): CandleState {
  const { positions, candleTime } = params;
  const nextOpen = candleTime + params.durationMilliseconds;
  return {
    isHolding: isHoldingAt(positions, candleTime),
    isBuyFilled: positions.some((position) => position.openedCandleTime === nextOpen),
    isLastCandle: params.lastCandleTime === candleTime,
    exit: findExitAt(positions, candleTime),
  };
}
