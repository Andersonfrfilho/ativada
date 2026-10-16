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
      openLiveDetail(harness);
      const tracking = await screen.findByRole('region', { name: 'Acompanhamento' });
      const decisions = await screen.findByRole('region', { name: 'O que a estratégia decidiu' });
      await waitFor(() => {
        expect(within(tracking).getByRole('button', { name: 'Tentar de novo' })).toBeDefined();
        expect(within(decisions).getByRole('button', { name: 'Tentar de novo' })).toBeDefined();
      });
      expect(tracking.id).toBe('acompanhamento');
      expect(decisions.id).toBe('decisoes');
      harness.isLiveStatusFailing = false;
      fireEvent.click(within(tracking).getByRole('button', { name: 'Tentar de novo' }));
      expect(
        await screen.findByRole('region', { name: 'O que a estratégia decidiu a cada hora' }),
      ).toBeDefined();
    },
    SLOW_MILLISECONDS,
  );

  test('the index under the chart lists every section and where the simulation starts', async () => {
    openLiveDetail(createLiveHarness());
    const index = await screen.findByRole('navigation', { name: 'Seções desta simulação' });
    const labels = within(index)
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(labels).toEqual(['Acompanhamento', 'Decisões', 'O que falta', 'Acertos', 'Escritório']);
    expect(within(index).getByText(/A simulação começa em/)).toBeDefined();
  });
});
