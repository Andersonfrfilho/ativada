// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EngineDecimal, type EngineDecimalValue } from '../engine-decimal.js';
import type { RunParameters } from '../strategy-config.types.js';
import {
  COARSE_STEP_BALANCE_SHARE,
  PERCENT_FACTOR,
  RUN_PARAMETER_WARNING,
  TICK_NOTICEABLE_RATE,
} from './risk.constant.js';
import type { RunParameterWarning } from './risk.types.js';

const SLIPPAGE_PLACES = 2;
const EFFECTIVE_PLACES = 1;

function formatPercent(rate: EngineDecimalValue, places: number): string {
  const percent = rate.times(PERCENT_FACTOR).toDecimalPlaces(places, EngineDecimal.ROUND_HALF_UP);
  return `${percent.toFixed().replace('.', ',')}%`;
}

function commaText(text: string): string {
  return text.replace('.', ',');
}

// O preço sobe ao tick (compra) e desce ao tick (venda): o slippage efetivo vai até slippage + tick ÷ preço.
function warnTick(parameters: RunParameters, price: EngineDecimalValue): RunParameterWarning[] {
  const slippage = new EngineDecimal(parameters.slippageRate);
  const tickRate = new EngineDecimal(parameters.tickSize).dividedBy(price);
  if (!tickRate.greaterThan(slippage) || tickRate.lessThan(TICK_NOTICEABLE_RATE)) return [];
  const effective = formatPercent(slippage.plus(tickRate), EFFECTIVE_PLACES);
  const configured = formatPercent(slippage, SLIPPAGE_PLACES);
  return [
    {
      code: RUN_PARAMETER_WARNING.TICK_DOMINATES_SLIPPAGE,
      message: `O tick de ${commaText(parameters.tickSize)} sobre o preço ${commaText(price.toFixed())} deixa o slippage efetivo em até ${effective}, bem acima do configurado (${configured}).`,
    },
  ];
}

function warnQuantityStep(
  parameters: RunParameters,
  price: EngineDecimalValue,
): RunParameterWarning[] {
  const balance = new EngineDecimal(parameters.initialBalance);
  const stepValue = new EngineDecimal(parameters.quantityStep).times(price);
  if (stepValue.greaterThan(balance)) {
    return [
      {
        code: RUN_PARAMETER_WARNING.QUANTITY_STEP_EXCEEDS_BALANCE,
        message: `Um passo de quantidade (${commaText(parameters.quantityStep)}) vale mais que o saldo inicial: a quantidade sempre zera.`,
      },
    ];
  }
  if (!stepValue.greaterThan(balance.times(COARSE_STEP_BALANCE_SHARE))) return [];
  return [
    {
      code: RUN_PARAMETER_WARNING.QUANTITY_STEP_COARSE,
      message: `Um passo de quantidade (${commaText(parameters.quantityStep)}) vale mais de 5% do saldo inicial: o tamanho da posição fica grosseiro.`,
    },
  ];
}

function warnMinNotional(parameters: RunParameters): RunParameterWarning[] {
  if (!new EngineDecimal(parameters.minNotional).greaterThan(parameters.initialBalance)) return [];
  return [
    {
      code: RUN_PARAMETER_WARNING.MIN_NOTIONAL_EXCEEDS_BALANCE,
      message: 'O valor mínimo da ordem passa do saldo inicial: nenhuma ordem pode ser enviada.',
    },
  ];
}

// Avisos, não erros: tick, passo e mínimo podem tornar o slippage efetivo ou o tamanho irreais.
export function warnRunParameters(
  runParameters: RunParameters,
  referencePrice: string,
): RunParameterWarning[] {
  const price = new EngineDecimal(referencePrice);
  return [
    ...warnTick(runParameters, price),
    ...warnQuantityStep(runParameters, price),
    ...warnMinNotional(runParameters),
  ];
}
