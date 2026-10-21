// Copyright (c) 2026 Ada Technology. All rights reserved.
import { describe, expect, test } from 'bun:test';

import { fireEvent, screen, waitFor, within } from '@testing-library/react';

import { createLiveHarness, openLiveDetail } from './support/live-tracking-harness.js';

const SLOW_MILLISECONDS = 8_000;

describe('seções do acompanhamento ao vivo sem o live-status', () => {
  test(
    'each section keeps its card with a retry, and the retry brings the detail back',
    async () => {
      const harness = createLiveHarness({ isLiveStatusFailing: true });
      openLiveDetail(harness, '#decisoes');
      const decisions = await screen.findByRole('region', { name: 'O que a estratégia decidiu' });
      await waitFor(() =>
        expect(within(decisions).getByRole('button', { name: 'Tentar de novo' })).toBeDefined(),
      );
      expect(decisions.id).toBe('decisoes');
      harness.isLiveStatusFailing = false;
      fireEvent.click(within(decisions).getByRole('button', { name: 'Tentar de novo' }));
      expect(
        await screen.findByRole('region', { name: 'O que a estratégia decidiu a cada hora' }),
      ).toBeDefined();
    },
    SLOW_MILLISECONDS,
  );
});

describe('abas da simulação ao vivo', () => {
  test('one tab at a time, Operações first; the old anchors still open their tab', async () => {
    openLiveDetail(createLiveHarness());
    const list = await screen.findByRole('tablist', { name: 'Detalhes da simulação' });
    const tabs = within(list).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Operações',
      'Decisões',
      'O que falta',
      'Acertos',
      'Acompanhamento',
    ]);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByRole('region', { name: 'Operações' })).toBeDefined();
    fireEvent.click(within(list).getByRole('tab', { name: 'Acompanhamento' }));
    expect(await screen.findByRole('region', { name: 'Acompanhamento' })).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Operações' })).toBeNull();
    fireEvent.keyDown(within(list).getByRole('tab', { name: 'Acompanhamento' }), { key: 'Home' });
    expect(within(list).getByRole('tab', { name: 'Operações' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });
});
