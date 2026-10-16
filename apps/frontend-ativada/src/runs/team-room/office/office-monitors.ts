// Copyright (c) 2026 Ada Technology. All rights reserved.
import { formatDecimalText } from '../../../format/decimal.js';
import type { TeamFamily } from '../team-room.constant.js';
import type { RuleLine, SpecialistView } from '../team-room.types.js';

const READING_FORMAT = { minimumFraction: 0, maximumFraction: 4 } as const;
const WHOLE_FORMAT = { minimumFraction: 0, maximumFraction: 0 } as const;
const WHOLE_FROM = 1000;
const GAUGE_MAXIMUM = 100;

export type MonitorKind = 'averages' | 'oscillator' | 'volume' | 'gauge' | 'empty';

export type MonitorReadout = {
  readonly key: string;
  readonly label: string;
  readonly text: string;
  // Só para desenho (0 a 1): a posição na escala conhecida do indicador; sem escala conhecida, `undefined`.
  readonly ratio: number | undefined;
};

export type MonitorModel = {
  readonly family: TeamFamily;
  readonly title: string;
  readonly kind: MonitorKind;
  readonly readouts: readonly MonitorReadout[];
};

type Scale = { readonly label: string; readonly isGauge: boolean };

// Os rótulos das saídas que o motor grava por regra; saída desconhecida aparece com o nome que o servidor usou.
const OUTPUT_LABEL: Readonly<Record<string, string>> = {
  fast: 'média rápida',
  slow: 'média lenta',
  lower: 'banda de baixo',
  middle: 'média',
  upper: 'banda de cima',
  macd: 'MACD',
  signal: 'linha de sinal',
  value: 'valor',
  obv: 'OBV',
  ema: 'média OBV',
};

// A mesma saída muda de nome conforme a regra: o Donchian guarda a mínima e a máxima das últimas velas.
const KIND_OUTPUT_LABEL: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  donchian_breakout: { lower: 'mínima', upper: 'máxima' },
};

const KIND_TITLE: Readonly<Record<string, string>> = {
  ema_cross: 'EMA',
  macd: 'MACD',
  donchian_breakout: 'Donchian',
  rsi: 'RSI',
  bollinger: 'Bollinger',
  obv_trend: 'Volume · OBV',
  fear_greed: 'Medo e Ganância',
};

const GAUGE_KINDS: ReadonlySet<string> = new Set(['rsi', 'fear_greed']);

function ratioOf(text: string): number | undefined {
  const value = Number(text);
  if (!Number.isFinite(value)) return undefined;
  return Math.min(Math.max(value / GAUGE_MAXIMUM, 0), 1);
}

function readoutsOf(rule: RuleLine, scale: Scale): readonly MonitorReadout[] {
  return Object.entries(rule.values ?? {}).map(([name, raw]) => ({
    key: `${rule.ruleId}:${name}`,
    label:
      name === 'value'
        ? scale.label
        : (KIND_OUTPUT_LABEL[rule.kind ?? '']?.[name] ?? OUTPUT_LABEL[name] ?? name),
    text: formatDecimalText(
      raw,
      Math.abs(Number(raw)) >= WHOLE_FROM ? WHOLE_FORMAT : READING_FORMAT,
    ),
    ratio: scale.isGauge ? ratioOf(raw) : undefined,
  }));
}

function kindOf(family: TeamFamily, hasReadouts: boolean): MonitorKind {
  if (!hasReadouts) return 'empty';
  if (family === 'trend') return 'averages';
  if (family === 'reversion') return 'oscillator';
  return family === 'volume' ? 'volume' : 'gauge';
}

// O que o monitor de cada mesa mostra: só as leituras que o servidor gravou na vela (EMA, RSI e bandas, OBV, Medo e
// Ganância). Regra sem leitura gravada não desenha número nenhum.
export function buildMonitor(
  family: TeamFamily,
  specialist: SpecialistView | undefined,
): MonitorModel {
  const rules = specialist?.rules ?? [];
  const readouts = rules.flatMap((rule) =>
    readoutsOf(rule, {
      label: KIND_TITLE[rule.kind ?? ''] ?? rule.label,
      isGauge: GAUGE_KINDS.has(rule.kind ?? ''),
    }),
  );
  const first = rules.find((rule) => rule.kind !== undefined);
  const title = rules.map((rule) => KIND_TITLE[rule.kind ?? ''] ?? rule.label).join(' · ');
  return {
    family,
    title: title === '' ? (first?.label ?? '') : title,
    kind: kindOf(family, readouts.length > 0),
    readouts,
  };
}
