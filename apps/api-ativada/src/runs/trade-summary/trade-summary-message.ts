// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, type EngineDecimalValue } from '@ativada/strategy-engine';

const DISPLAY_DECIMAL_PLACES = 2;
const THOUSANDS_PATTERN = /\B(?=(\d{3})+(?!\d))/g;
const MINUS_SIGN = '−';
const NO_CLOSED_TRADES = 'Nenhuma operação fechada ainda.';

export type TradeSummaryNumbers = {
  readonly closedTrades: number;
  readonly totalPaid: string;
  readonly totalReceived: string;
  readonly totalFees: string;
  readonly net: string;
  readonly openTrades: number;
  readonly openPaid: string | undefined;
};

type RoundingDirection = 'up' | 'down';

// Sempre contra o usuário: o que se paga (pago e taxas) sobe e o que se recebe (recebido e saldo) desce, em direção a -infinito.
function formatAmount(text: string, direction: RoundingDirection): string {
  const mode = direction === 'up' ? EngineDecimal.ROUND_CEIL : EngineDecimal.ROUND_FLOOR;
  const rounded: EngineDecimalValue = new EngineDecimal(text).toDecimalPlaces(
    DISPLAY_DECIMAL_PLACES,
    mode,
  );
  const [integer = '0', fraction = ''] = rounded.abs().toFixed(DISPLAY_DECIMAL_PLACES).split('.');
  const sign = rounded.isNegative() && !rounded.isZero() ? MINUS_SIGN : '';
  return `${sign}${integer.replace(THOUSANDS_PATTERN, '.')},${fraction}`;
}

function describeOpenTrades(numbers: TradeSummaryNumbers): string {
  if (numbers.openTrades === 0 || numbers.openPaid === undefined) return '';
  const subject =
    numbers.openTrades === 1
      ? 'uma operação ainda aberta'
      : `${numbers.openTrades} operações ainda abertas`;
  return ` + ${subject}, com ${formatAmount(numbers.openPaid, 'up')} USDT pagos.`;
}

function describeClosedTrades(numbers: TradeSummaryNumbers): string {
  if (numbers.closedTrades === 0) return NO_CLOSED_TRADES;
  const purchases = numbers.closedTrades === 1 ? '1 compra' : `${numbers.closedTrades} compras`;
  const paid = formatAmount(numbers.totalPaid, 'up');
  const received = formatAmount(numbers.totalReceived, 'down');
  const fees = formatAmount(numbers.totalFees, 'up');
  const net = formatAmount(numbers.net, 'down');
  return `Você pagou ${paid} USDT em ${purchases} e recebeu ${received} USDT nas vendas. Taxas: ${fees} USDT. Saldo líquido: ${net} USDT.`;
}

// A frase pronta do resumo (ADR 0002, spec 005, O11): português simples, 2 casas, milhar com ponto e vírgula decimal.
export function buildTradeSummaryMessage(numbers: TradeSummaryNumbers): string {
  return `${describeClosedTrades(numbers)}${describeOpenTrades(numbers)}`;
}
