// Copyright (c) 2026 Ada Technology. All rights reserved.
// O harness (`make panel-e2e`) entrega tudo por variáveis; sem ele estes testes não rodam.
export type ExpectedDisplay = {
  readonly equity: string;
  readonly initial: string;
  readonly resultChange: string;
  readonly benchmarkChange: string;
  readonly firstSignal: string;
  readonly secondSignal: string;
  readonly bitcoinPrice: string;
  readonly bitcoinChange: string;
};

export type E2eEnvironment = {
  readonly apiUrl: string;
  readonly username: string;
  readonly password: string;
  readonly email: string;
  readonly telegramSecret: string;
  readonly telegramChatId: string;
  readonly expected: ExpectedDisplay;
};

function readRequired(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`variável ${name} ausente; rode por make panel-e2e`);
  }
  return value;
}

function isExpectedDisplay(value: unknown): value is ExpectedDisplay {
  if (typeof value !== 'object' || value === null) return false;
  const keys = [
    'equity',
    'initial',
    'resultChange',
    'benchmarkChange',
    'firstSignal',
    'secondSignal',
    'bitcoinPrice',
    'bitcoinChange',
  ];
  return keys.every((key) => key in value && typeof Reflect.get(value, key) === 'string');
}

export function readE2eEnvironment(): E2eEnvironment {
  const expected: unknown = JSON.parse(readRequired('PANEL_E2E_EXPECTED'));
  if (!isExpectedDisplay(expected)) throw new Error('PANEL_E2E_EXPECTED inválida');
  return {
    apiUrl: readRequired('PANEL_E2E_API_URL'),
    username: readRequired('PANEL_E2E_USERNAME'),
    password: readRequired('PANEL_E2E_PASSWORD'),
    email: readRequired('PANEL_E2E_EMAIL'),
    telegramSecret: readRequired('PANEL_E2E_TELEGRAM_SECRET'),
    telegramChatId: readRequired('PANEL_E2E_TELEGRAM_CHAT_ID'),
    expected,
  };
}
