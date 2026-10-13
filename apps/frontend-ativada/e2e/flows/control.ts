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
