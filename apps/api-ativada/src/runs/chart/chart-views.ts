// Copyright (c) 2026 Ada Technology. All rights reserved.
import type { FillClusterBucket, FillMarkerInput, PriceColumn, TimeRange } from '@ativada/database';
import {
  EngineDecimal,
  formatEngineDecimal,
  ORDER_SIDE,
  type EngineDecimalValue,
} from '@ativada/strategy-engine';

import { formatOptionalDecimal, roundMoneyDown, roundMoneyUp } from '../money-rounding.js';
import type { ChartDecisionView } from './chart-decisions.js';

export type ChartMarkerView = {
  readonly positionKey: string;
  readonly side: string;
  readonly candleTime: number;
  readonly price: string;
  readonly quantity: string;
  readonly fee: string;
  // Compra: o valor pago (notional para cima + taxa). Venda: o valor recebido (notional para baixo - taxa).
  readonly amount: string;
  readonly netProfit: string | undefined;
  readonly netProfitRate: string | undefined;
};

export type ChartClusterView = {
  readonly startTime: number;
  readonly endTime: number;
  readonly buys: number;
  readonly sells: number;
};

export type ChartView = {
  readonly symbol: string;
  readonly timeframe: string;
  readonly from: number;
  readonly to: number;
  // A faixa efetiva da execução (a que `from`/`to` pedidos são recortados), para o painel limitar atalhos e deslocamento.
  readonly runRange: { readonly from: number; readonly to: number };
  readonly lastClosedCandleTime: number | null;
  readonly columns: readonly PriceColumn[];
  readonly markers: readonly ChartMarkerView[] | null;
  readonly clusters: readonly ChartClusterView[] | null;
  readonly totals: { readonly buys: number; readonly sells: number };
  // As decisões de cada vela da faixa (spec 008, L16): só na simulação ao vivo e com até 500 velas; `null` nos demais casos.
  readonly decisions: readonly ChartDecisionView[] | null;
};

function computeAmount(marker: FillMarkerInput): EngineDecimalValue {
  const notional = new EngineDecimal(marker.notional);
  return marker.side === ORDER_SIDE.BUY
    ? roundMoneyUp(notional).plus(marker.fee)
    : roundMoneyDown(notional).minus(marker.fee);
}

// O pago da operação é recebido - resultado (o caixa do motor garante a identidade), então a venda dispensa a compra.
function computeRate(
  netProfit: EngineDecimalValue,
  received: EngineDecimalValue,
): EngineDecimalValue | undefined {
  const paid = received.minus(netProfit);
  return paid.isZero() ? undefined : roundMoneyDown(netProfit.dividedBy(paid));
}

export function toMarkerView(marker: FillMarkerInput): ChartMarkerView {
  const amount = computeAmount(marker);
  const netProfit =
    marker.netProfit === undefined ? undefined : new EngineDecimal(marker.netProfit);
  return {
    positionKey: marker.positionKey,
    side: marker.side,
    candleTime: marker.candleTime,
    price: marker.price,
    quantity: marker.quantity,
    fee: marker.fee,
    amount: formatEngineDecimal(amount),
    netProfit: marker.netProfit,
    netProfitRate:
      netProfit === undefined ? undefined : formatOptionalDecimal(computeRate(netProfit, amount)),
  };
}

// Limite nominal do balde: o menor tempo inteiro com `balde >= b`, ou seja `from + ceil(b * W / C)` (ADR 0002, O9).
function bucketEdge(params: {
  readonly range: TimeRange;
  readonly columns: number;
  readonly bucket: number;
}): number {
  const { range, columns, bucket } = params;
  const width = BigInt(range.to - range.from);
  const columnCount = BigInt(columns);
  const scaled = BigInt(bucket) * width;
  return range.from + Number((scaled + columnCount - 1n) / columnCount);
}

export function toClusterViews(params: {
  readonly buckets: readonly FillClusterBucket[];
  readonly range: TimeRange;
  readonly columns: number;
}): readonly ChartClusterView[] {
  const { buckets, range, columns } = params;
  return buckets.map((item) => ({
    startTime: bucketEdge({ range, columns, bucket: item.bucket }),
    endTime: bucketEdge({ range, columns, bucket: item.bucket + 1 }),
    buys: item.buys,
    sells: item.sells,
  }));
}
