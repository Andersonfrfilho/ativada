// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EngineDecimal,
  type EngineDecimalValue,
} from '../../../../packages/strategy-engine/src/index.js';
import type { RealDataset } from '../signal/classic-signals.fixture.js';

// A conta à mão das duas primeiras operações de cada conjunto real, só com `decimal.js` e as fórmulas do
// ADR 0002 §e (nenhuma função do motor): preço de preenchimento, taxa, quantidade, stop, alvo e resultado.
// As entradas vêm do dado cru (candles) e do ATR gravado no sinal de decisão; o ATR cruza para decimal com
// 15 algarismos significativos (`toPrecision`), como o motor declara.
const TICK = new EngineDecimal('0.01');
const QUANTITY_STEP = new EngineDecimal('0.00001');
const FEE = new EngineDecimal('0.001');
const SLIPPAGE = new EngineDecimal('0.0005');
const RISK_PER_TRADE = new EngineDecimal('0.01');
const STOP_ATR_MULTIPLE = new EngineDecimal(2);
const TARGET_ATR_MULTIPLE = new EngineDecimal(3);
const VOLUME_SHARE = new EngineDecimal('0.01');
const ONE = new EngineDecimal(1);
const MONEY_UNIT = new EngineDecimal('1e-8');
const ATR_DIGITS = 15;
const LOSS_SLACK = MONEY_UNIT.times(4);
const DEBIT_SLACK = MONEY_UNIT.times(2);
const MONEY_PLACES = 8;

export type PaperTrade = {
  // Índice (no conjunto) do candle de DECISÃO, o ATR gravado no sinal dele e o caixa na hora.
  readonly decisionIndex: number;
  readonly atr: number;
  readonly cashAtDecision: string;
  // Saída: índice do candle onde sai e como (stop do candle ou venda a mercado na abertura por sinal).
  readonly exitIndex: number;
  readonly exitReason: 'stop' | 'signal';
  readonly expected: PaperResult;
};

export type PaperResult = {
  readonly entryPrice: string;
  readonly stopPrice: string;
  readonly targetPrice: string;
  readonly quantity: string;
  readonly entryFee: string;
  readonly exitPrice: string;
  readonly exitFee: string;
  readonly netProfit: string;
};

function floorTo(value: EngineDecimalValue, increment: EngineDecimalValue): EngineDecimalValue {
  return value.dividedBy(increment).floor().times(increment);
}

function ceilTo(value: EngineDecimalValue, increment: EngineDecimalValue): EngineDecimalValue {
  return value.dividedBy(increment).ceil().times(increment);
}

function moneyUp(value: EngineDecimalValue): EngineDecimalValue {
  return value.toDecimalPlaces(MONEY_PLACES, EngineDecimal.ROUND_CEIL);
}

function moneyDown(value: EngineDecimalValue): EngineDecimalValue {
  return value.toDecimalPlaces(MONEY_PLACES, EngineDecimal.ROUND_FLOOR);
}

export type PaperParams = {
  readonly trade: PaperTrade;
  readonly dataset: RealDataset;
  readonly initialBalance: string;
};

export function paperTrade(params: PaperParams): PaperResult {
  const { trade, dataset } = params;
  const decision = dataset.candles[trade.decisionIndex];
  const entry = dataset.candles[trade.decisionIndex + 1];
  const exit = dataset.candles[trade.exitIndex];
  if (decision === undefined || entry === undefined || exit === undefined) {
    throw new Error('Candle ausente na conta à mão.');
  }
  // Decisão em t: valor em risco = saldo × 1%, para baixo em 8 casas; distâncias pelo ATR de t.
  const atr = new EngineDecimal(trade.atr.toPrecision(ATR_DIGITS));
  const riskAmount = moneyDown(new EngineDecimal(trade.cashAtDecision).times(RISK_PER_TRADE));
  // Preenchimento na abertura de t+1: P = abertura × (1 + slippage), tick para cima.
  const price = ceilTo(new EngineDecimal(entry.open).times(ONE.plus(SLIPPAGE)), TICK);
  const stop = floorTo(price.minus(atr.times(STOP_ATR_MULTIPLE)), TICK);
  const target = ceilTo(price.plus(atr.times(TARGET_ATR_MULTIPLE)), TICK);
  // Quantidade: (risco − folga) ÷ (P − X + P·taxa + X·taxa), com X = saída estimada no stop.
  const stopExit = floorTo(stop.times(ONE.minus(SLIPPAGE)), TICK);
  const riskPerUnit = price.minus(stopExit).plus(price.times(FEE)).plus(stopExit.times(FEE));
  const byRisk = floorTo(riskAmount.minus(LOSS_SLACK).dividedBy(riskPerUnit), QUANTITY_STEP);
  const byCash = floorTo(
    new EngineDecimal(trade.cashAtDecision)
      .minus(DEBIT_SLACK)
      .dividedBy(ONE.plus(FEE))
      .dividedBy(price),
    QUANTITY_STEP,
  );
  const byVolume = floorTo(new EngineDecimal(decision.volume).times(VOLUME_SHARE), QUANTITY_STEP);
  const quantity = EngineDecimal.min(byRisk, byCash, byVolume);
  const entryNotional = quantity.times(price);
  const entryFee = moneyUp(entryNotional.times(FEE));
  const debit = moneyUp(entryNotional).plus(entryFee);
  // Saída: stop sai a min(stop, abertura) × (1 − slippage), tick para baixo; venda a mercado na abertura.
  const base =
    trade.exitReason === 'stop'
      ? EngineDecimal.min(stop, new EngineDecimal(exit.open))
      : new EngineDecimal(exit.open);
  const exitPrice = floorTo(base.times(ONE.minus(SLIPPAGE)), TICK);
  const exitNotional = quantity.times(exitPrice);
  const exitFee = moneyUp(exitNotional.times(FEE));
  const credit = moneyDown(exitNotional).minus(exitFee);
  return {
    entryPrice: price.toFixed(),
    stopPrice: stop.toFixed(),
    targetPrice: target.toFixed(),
    quantity: quantity.toFixed(),
    entryFee: entryFee.toFixed(),
    exitPrice: exitPrice.toFixed(),
    exitFee: exitFee.toFixed(),
    netProfit: credit.minus(debit).toFixed(),
  };
}

// Os números de `expected` foram conferidos por uma terceira conta (Python `decimal`), fora do TypeScript.
export const PAPER_TRADES: Readonly<Record<string, readonly PaperTrade[]>> = {
  'BTCUSDT 1h × 500': [
    {
      decisionIndex: 221,
      atr: 815.9045948555881,
      cashAtDecision: '10000',
      exitIndex: 231,
      exitReason: 'stop',
      expected: {
        entryPrice: '94003.81',
        stopPrice: '92372',
        targetPrice: '96451.53',
        quantity: '0.05363',
        entryFee: '5.04142434',
        exitPrice: '92325.81',
        exitFee: '4.9514332',
        netProfit: '-99.98399754',
      },
    },
    {
      decisionIndex: 231,
      atr: 963.1574962486147,
      cashAtDecision: '9900.01600246',
      exitIndex: 247,
      exitReason: 'signal',
      expected: {
        entryPrice: '93777.8',
        stopPrice: '91851.48',
        targetPrice: '96667.28',
        quantity: '0.04587',
        entryFee: '4.30158769',
        exitPrice: '94169.15',
        exitFee: '4.31953892',
        netProfit: '9.33009789',
      },
    },
  ],
  'ETHUSDT 1d × 400': [
    {
      decisionIndex: 198,
      atr: 147.77294598509965,
      cashAtDecision: '10000',
      exitIndex: 206,
      exitReason: 'stop',
      expected: {
        entryPrice: '3388.75',
        stopPrice: '3093.2',
        targetPrice: '3832.07',
        quantity: '0.3294',
        entryFee: '1.11625425',
        exitPrice: '3091.65',
        exitFee: '1.01838951',
        netProfit: '-99.99938376',
      },
    },
    {
      decisionIndex: 264,
      atr: 119.32726073536132,
      cashAtDecision: '9900.00061624',
      exitIndex: 275,
      exitReason: 'stop',
      expected: {
        entryPrice: '2613.71',
        stopPrice: '2375.05',
        targetPrice: '2971.7',
        quantity: '0.40434',
        entryFee: '1.05682751',
        exitPrice: '2373.86',
        exitFee: '0.95984656',
        netProfit: '-98.99762307',
      },
    },
  ],
};
