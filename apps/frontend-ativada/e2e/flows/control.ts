// Copyright (c) 2026 Ada Technology. All rights reserved.
import { expect, type APIRequestContext } from '@playwright/test';

export type Control = { readonly request: APIRequestContext; readonly url: string };

// O preço chega pelo ticker de verdade (Binance falsa → API → WebSocket → painel); só a origem do número é do teste.
export async function sendTick(control: Control, symbol: string, price: string): Promise<void> {
  const response = await control.request.post(`${control.url}/tick`, { data: { symbol, price } });
  expect(response.ok()).toBe(true);
}

// O preenchimento entra pelo banco e pelo NOTIFY reais (servidor de controle no papel do worker); só a origem do dado é do teste.
export async function sendFill(control: Control, side: 'buy' | 'sell'): Promise<void> {
  const response = await control.request.post(`${control.url}/fill`, { data: { side } });
  expect(response.ok()).toBe(true);
}

// A faixa de parada vem do mesmo caminho da varredura da API: `runs.stalled_since` no banco e o NOTIFY `warning`; só a origem do dado é do teste.
export async function sendStall(control: Control, action: 'stall' | 'resume'): Promise<void> {
  const response = await control.request.post(`${control.url}/stall`, { data: { action } });
  expect(response.ok()).toBe(true);
}

// A decisão de esperar entra pelo banco e pelo NOTIFY reais (servidor de controle no papel do worker): sinal HOLD + ponto de patrimônio.
export async function sendDecision(control: Control): Promise<void> {
  const response = await control.request.post(`${control.url}/decision`);
  expect(response.ok()).toBe(true);
}

export type Kline = {
  readonly open: string;
  readonly high: string;
  readonly low: string;
  readonly close: string;
};

// A vela de 1 h em formação entra pela Binance falsa e pelo ticker de verdade (agregador, `candle`, WebSocket); só os preços são do teste.
export async function sendKline(control: Control, kline: Kline): Promise<void> {
  const response = await control.request.post(`${control.url}/kline`, { data: kline });
  expect(response.ok()).toBe(true);
}

// Um backtest de 1 h com 5.000 velas, rodado pelo caso de uso de produção; devolve o id da execução.
export async function createLongRun(control: Control): Promise<string> {
  const response = await control.request.post(`${control.url}/long-run`, { timeout: 120_000 });
  expect(response.ok()).toBe(true);
  const body: unknown = await response.json();
  const runId: unknown =
    typeof body === 'object' && body !== null ? Reflect.get(body, 'runId') : undefined;
  if (typeof runId !== 'string') throw new Error('o /long-run não devolveu o runId');
  return runId;
}

// A decisão do analista de risco entra pelo banco e pelo NOTIFY reais (servidor de controle no papel do worker: a simulação criada
// pelo painel passa a rodar); devolve o id da simulação. Só a origem do dado é do teste.
export async function sendAnalystDecision(
  control: Control,
  scenario: 'pause' | 'confident',
): Promise<string> {
  const response = await control.request.post(`${control.url}/analyst-decision`, {
    data: { scenario },
  });
  expect(response.ok()).toBe(true);
  const body: unknown = await response.json();
  const runId: unknown =
    typeof body === 'object' && body !== null ? Reflect.get(body, 'runId') : undefined;
  if (typeof runId !== 'string') throw new Error('o /analyst-decision não devolveu o runId');
  return runId;
}
