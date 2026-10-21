// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { fireEvent, screen, within } from '@testing-library/react';

import { GLOSSARY, GLOSSARY_TERM } from '../src/glossary/glossary.constant.js';
import { Term } from '../src/glossary/Term.component.js';
import { dataResponse, pageResponse, type FakeRoute } from './support/fake-fetch.js';
import { renderApp } from './support/render-app.js';
import {
  buildEquityCsv,
  buildMetrics,
  buildRun,
  buildStrategy,
  buildVersion,
} from './support/run-fixtures.js';

const SHARPE_PHRASE = GLOSSARY[GLOSSARY_TERM.SHARPE].phrase;

function showTerm(): void {
  renderApp({
    path: '/',
    isAuthenticated: true,
    probe: (
      <div>
        <input aria-label="Outro campo" />
        <p>
          <Term term={GLOSSARY_TERM.SHARPE} />
        </p>
      </div>
    ),
  });
}

function trigger(): HTMLElement {
  return screen.getByRole('button', { name: 'O que é Sharpe?' });
}

describe('Term: markup', () => {
  test('keeps the visible label and points the button at the phrase', () => {
    showTerm();
    expect(screen.getByText('Sharpe')).toBeDefined();
    const describedBy = trigger().getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    const phrase = document.getElementById(describedBy ?? '');
    expect(phrase?.textContent).toBe(SHARPE_PHRASE);
    expect(phrase?.getAttribute('role')).toBe('tooltip');
  });

  test('starts closed', () => {
    showTerm();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('Term: keyboard', () => {
  test('focus opens and blur closes', () => {
    showTerm();
    fireEvent.focus(trigger());
    expect(screen.getByRole('tooltip').textContent).toBe(SHARPE_PHRASE);
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    fireEvent.blur(trigger());
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  test('Escape closes, wherever the focus is', () => {
    showTerm();
    fireEvent.focus(trigger());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  test('Enter and Space on the focused button toggle it (they arrive as click)', () => {
    showTerm();
    fireEvent.click(trigger());
    expect(screen.getByRole('tooltip')).toBeDefined();
    fireEvent.click(trigger());
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('Term: mouse and touch', () => {
  test('a press opens on click even though the press focuses the button first', () => {
    showTerm();
    fireEvent.pointerDown(trigger());
    fireEvent.focus(trigger());
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.click(trigger());
    expect(screen.getByRole('tooltip')).toBeDefined();
  });

  test('a second press closes it', () => {
    showTerm();
    fireEvent.pointerDown(trigger());
    fireEvent.focus(trigger());
    fireEvent.click(trigger());
    fireEvent.pointerDown(trigger());
    fireEvent.click(trigger());
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  test('a press outside closes it, a press on the phrase does not', () => {
    showTerm();
    fireEvent.click(trigger());
    fireEvent.pointerDown(screen.getByRole('tooltip'));
    expect(screen.getByRole('tooltip')).toBeDefined();
    fireEvent.pointerDown(screen.getByLabelText('Outro campo'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  test('opening never moves the focus', () => {
    showTerm();
    const input = screen.getByLabelText('Outro campo');
    input.focus();
    fireEvent.click(trigger());
    expect(document.activeElement).toBe(input);
  });
});

const ROUTES: readonly FakeRoute[] = [
  {
    method: 'GET',
    path: '/v1/strategies',
    respond: (): Response => pageResponse([buildStrategy()]),
  },
  {
    method: 'GET',
    path: '/v1/strategies/strategy-1/versions',
    respond: (): Response => pageResponse([buildVersion()]),
  },
  { method: 'GET', path: '/v1/runs/run-1', respond: (): Response => dataResponse(buildRun()) },
  {
    method: 'GET',
    path: '/v1/runs/run-1/export.csv',
    respond: (): Response =>
      new Response(buildEquityCsv(60), { headers: { 'Content-Type': 'text/csv' } }),
  },
  { method: 'GET', path: '/v1/runs/run-1/trades', respond: (): Response => pageResponse([]) },
  {
    method: 'GET',
    path: '/v1/runs',
    respond: (): Response =>
      pageResponse([buildRun(), buildRun({ id: 'run-2', metrics: buildMetrics() })]),
  },
  {
    method: 'GET',
    path: '/v1/runs/run-2',
    respond: (): Response => dataResponse(buildRun({ id: 'run-2' })),
  },
];

const LABELS = [
  GLOSSARY[GLOSSARY_TERM.MAX_DRAWDOWN].label,
  GLOSSARY[GLOSSARY_TERM.SHARPE].label,
  GLOSSARY[GLOSSARY_TERM.SORTINO].label,
  GLOSSARY[GLOSSARY_TERM.WIN_RATE].label,
  GLOSSARY[GLOSSARY_TERM.PROFIT_FACTOR].label,
];

function glossaryPhraseOf(label: string): string | undefined {
  return Object.values(GLOSSARY).find((candidate) => candidate.label === label)?.phrase;
}

function openedPhrase(button: HTMLElement): string | undefined {
  fireEvent.click(button);
  const id = button.getAttribute('aria-describedby') ?? '';
  return document.getElementById(id)?.textContent ?? undefined;
}

describe('Term on the backtest screens', () => {
  test('the result card keeps each label and gives it the glossary phrase', async () => {
    renderApp({ path: '/backtests/run-1', isAuthenticated: true, routes: ROUTES });
    const card = await screen.findByRole('region', { name: 'Resultado' });
    for (const label of LABELS) {
      const button = within(card).getByRole('button', { name: `O que é ${label}?` });
      expect(within(card).getByText(label)).toBeDefined();
      expect(openedPhrase(button)).toBe(glossaryPhraseOf(label));
    }
  });

  test('the costs card explains slippage with the glossary phrase', async () => {
    renderApp({ path: '/backtests/run-1', isAuthenticated: true, routes: ROUTES });
    const card = await screen.findByRole('region', { name: 'Custos incluídos' });
    const button = within(card).getByRole('button', { name: 'O que é Slippage?' });
    expect(within(card).getByText('slippage')).toBeDefined();
    expect(openedPhrase(button)).toBe(GLOSSARY[GLOSSARY_TERM.SLIPPAGE].phrase);
  });

  test('the comparison table uses the same phrases as the result card', async () => {
    renderApp({
      path: '/backtests/comparar?a=run-1&b=run-2',
      isAuthenticated: true,
      routes: ROUTES,
    });
    const table = await screen.findByRole('table', { name: 'Comparação de execuções' });
    for (const label of LABELS) {
      const button = within(table).getByRole('button', { name: `O que é ${label}?` });
      const row = within(table).getByRole('row', { name: new RegExp(label) });
      expect(row.textContent).toContain(label);
      expect(openedPhrase(button)).toBe(glossaryPhraseOf(label));
    }
    expect(within(table).queryByRole('button', { name: 'O que é Slippage?' })).toBeNull();
  });
});
