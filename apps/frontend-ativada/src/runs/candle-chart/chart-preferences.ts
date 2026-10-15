// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@ativada/environment';

import { TIMEFRAMES } from '../run.constant.js';
import { CHART_PREFERENCES_STORAGE_KEY } from './candle-chart.constant.js';

// Preferência de tela (RF10 e RNF09): só camadas ligadas e a vela escolhida, nada sensível.
// Padrões da spec 009 D12 e da spec 008 D6: "Stop e alvo" e "Esperou" começam desligados.
const DEFAULT_LAYERS = {
  forecast: true,
  trades: true,
  strategyLines: true,
  stopTarget: false,
  waited: false,
} as const;

const layersSchema = z
  .object({
    forecast: z.boolean().catch(DEFAULT_LAYERS.forecast),
    trades: z.boolean().catch(DEFAULT_LAYERS.trades),
    strategyLines: z.boolean().catch(DEFAULT_LAYERS.strategyLines),
    stopTarget: z.boolean().catch(DEFAULT_LAYERS.stopTarget),
    waited: z.boolean().catch(DEFAULT_LAYERS.waited),
  })
  .catch(DEFAULT_LAYERS);

// `timeframe: null` = a vela da própria execução.
const preferencesSchema = z.object({
  layers: layersSchema,
  timeframe: z.enum(TIMEFRAMES).nullable().catch(null),
});

export type ChartPreferences = z.infer<typeof preferencesSchema>;
export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const DEFAULT_CHART_PREFERENCES: ChartPreferences = {
  layers: DEFAULT_LAYERS,
  timeframe: null,
};

// O acesso ao `localStorage` pode lançar (janela privada, dados do site bloqueados): sem ele, vale o padrão.
function defaultStorage(): PreferenceStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function parseStored(text: string | null): unknown {
  if (text === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return undefined;
  }
}

// Valor inválido, JSON quebrado ou armazenamento indisponível caem no padrão, campo a campo.
export function readChartPreferences(
  storage: PreferenceStorage | undefined = defaultStorage(),
): ChartPreferences {
  try {
    const text = storage?.getItem(CHART_PREFERENCES_STORAGE_KEY) ?? null;
    const parsed = preferencesSchema.safeParse(parseStored(text));
    return parsed.success ? parsed.data : DEFAULT_CHART_PREFERENCES;
  } catch {
    return DEFAULT_CHART_PREFERENCES;
  }
}

// Sem armazenamento a escolha vale só nesta sessão; não é erro para a tela.
export function writeChartPreferences(
  preferences: ChartPreferences,
  storage: PreferenceStorage | undefined = defaultStorage(),
): void {
  try {
    storage?.setItem(CHART_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    return;
  }
}
