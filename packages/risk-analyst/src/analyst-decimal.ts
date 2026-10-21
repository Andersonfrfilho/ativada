// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  EngineDecimal,
  formatEngineDecimal,
  toEngineDecimal,
  type EngineDecimalValue,
} from '@ativada/strategy-engine';

import { ANALYST_RULES } from './analyst.constant.js';

// Divisão a 12 casas arredondada para BAIXO (A8): o texto canônico do motor, sem zeros à direita.
export function divideDown(numerator: EngineDecimalValue, denominator: EngineDecimalValue): string {
  const quotient = numerator.dividedBy(denominator);
  return formatEngineDecimal(
    quotient.toDecimalPlaces(ANALYST_RULES.decimalPlaces, EngineDecimal.ROUND_FLOOR),
  );
}

export function divideUp(numerator: EngineDecimalValue, denominator: EngineDecimalValue): string {
  const quotient = numerator.dividedBy(denominator);
  return formatEngineDecimal(
    quotient.toDecimalPlaces(ANALYST_RULES.decimalPlaces, EngineDecimal.ROUND_CEIL),
  );
}

const PLAIN_DECIMAL = /^(\d+)(?:\.(\d+))?$/;

type PlainDecimal = { readonly integer: string; readonly fraction: string };

// Texto decimal simples (sem sinal nem expoente, como o banco devolve o preço): parte inteira sem zeros à esquerda e fração.
export function splitPlainDecimal(text: string): PlainDecimal | undefined {
  const parts = PLAIN_DECIMAL.exec(text);
  if (parts === null) return undefined;
  return { integer: (parts[1] ?? '').replace(/^0+(?=\d)/, ''), fraction: parts[2] ?? '' };
}

// Comparação exata de dois textos decimais. O caminho comum compara os dígitos sem criar decimal, que é o que pesa nas
// milhares de velas do auditor; o resto cai no decimal.
export function compareDecimalTexts(left: string, right: string): number {
  const leftPlain = splitPlainDecimal(left);
  const rightPlain = splitPlainDecimal(right);
  if (leftPlain === undefined || rightPlain === undefined) {
    return decimalOf(left).comparedTo(decimalOf(right));
  }
  if (leftPlain.integer.length !== rightPlain.integer.length) {
    return leftPlain.integer.length < rightPlain.integer.length ? -1 : 1;
  }
  if (leftPlain.integer !== rightPlain.integer)
    return leftPlain.integer < rightPlain.integer ? -1 : 1;
  const width = Math.max(leftPlain.fraction.length, rightPlain.fraction.length);
  const paddedLeft = leftPlain.fraction.padEnd(width, '0');
  const paddedRight = rightPlain.fraction.padEnd(width, '0');
  if (paddedLeft === paddedRight) return 0;
  return paddedLeft < paddedRight ? -1 : 1;
}

// Os textos em ordem crescente do valor (empate fica em qualquer ordem: o valor é o mesmo). Quando todos são simples, a
// ordenação usa o inteiro exato da escala comum (BigInt), bem mais barata que o decimal; senão, o decimal.
export function sortDecimalTexts(texts: readonly string[]): string[] {
  const plain = texts.map(splitPlainDecimal);
  const width = Math.max(0, ...plain.map((item) => item?.fraction.length ?? 0));
  const keyed: { readonly text: string; readonly key: bigint }[] = [];
  for (const [index, item] of plain.entries()) {
    const text = texts[index];
    if (item === undefined || text === undefined) {
      return [...texts].sort((left, right) => decimalOf(left).comparedTo(decimalOf(right)));
    }
    keyed.push({ text, key: BigInt(item.integer + item.fraction.padEnd(width, '0')) });
  }
  keyed.sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0));
  return keyed.map((item) => item.text);
}

export function sumTexts(values: readonly string[]): EngineDecimalValue {
  return values.reduce((total, value) => total.plus(value), new EngineDecimal(0));
}

export function decimalOf(text: string): EngineDecimalValue {
  return toEngineDecimal(text);
}
