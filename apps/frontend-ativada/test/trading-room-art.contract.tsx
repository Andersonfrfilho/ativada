// Copyright (c) 2026 Ada Technology. All rights reserved.
import { afterEach, describe, expect, test } from 'bun:test';

import { cleanup, render, screen, within } from '@testing-library/react';

import { LiveMarketProvider } from '../src/live/LiveMarketProvider.component.js';
import { OfficeAgent } from '../src/runs/trading-room/OfficeAgent.component.js';
import { avatarPoses } from '../src/runs/trading-room/avatar-poses.js';
import { buildDeskArt } from '../src/runs/trading-room/desk-art.js';
import { FearGreedScreen } from '../src/runs/trading-room/FearGreedScreen.component.js';
import { DESKS, seatOf, FLOOR_TOP } from '../src/runs/trading-room/office-geometry.js';
import { AVATAR_HEIGHT, AVATAR_WIDTH } from '../src/runs/trading-room/pixel-avatar.js';
import { buildRoomArt, ROOM_VIEW } from '../src/runs/trading-room/room-art.js';
import { RoomArt } from '../src/runs/trading-room/RoomArt.component.js';
import { scorePips } from '../src/runs/trading-room/wall-model.js';
import { WallHeatmap } from '../src/runs/trading-room/WallScreens.component.js';
import { dataResponse } from './support/fake-fetch.js';
import { renderApp } from './support/render-app.js';

// Spec 011, Fase 3, S3: pixel art original e a parede de telas.

afterEach(cleanup);

const CREW = [
  'tiago',
  'renata',
  'alice',
  'vitor',
  'sofia',
  'otavio',
  'nina',
  'lucas',
  'olivia',
] as const;

describe('pixel avatars', () => {
  test('every agent is drawn the same way every time, inside the 18 × 29 grid, with an outline', () => {
    for (const who of CREW) {
      const poses = avatarPoses(who);
      expect(avatarPoses(who)).toBe(poses);
      for (const runs of [poses.idle, poses.step, poses.point]) {
        expect(runs.some((run) => run.color === 'line')).toBe(true);
        expect(runs.every((run) => run.x >= 0 && run.x + run.w <= AVATAR_WIDTH)).toBe(true);
        expect(runs.every((run) => run.y >= 0 && run.y < AVATAR_HEIGHT)).toBe(true);
      }
      expect(poses.point).not.toEqual(poses.idle);
    }
  });

  test('silhouettes differ: no two rule agents share the same idle drawing', () => {
    const drawings = ['tiago', 'renata', 'alice', 'vitor', 'sofia', 'otavio'].map((who) =>
      JSON.stringify(avatarPoses(who === 'tiago' ? 'tiago' : (who as 'renata')).idle),
    );
    expect(new Set(drawings).size).toBe(drawings.length);
  });
});

describe('model teams are people, and everyone has a shadow', () => {
  const ROBOT_PARTS = ['visor', 'visor-eye', 'glow', 'head', 'head-d'];

  test('Nina, Lucas and Olívia are drawn as distinct humans with the purple badge and no robot parts', () => {
    const drawings = ['nina', 'lucas', 'olivia'] as const;
    for (const who of drawings) {
      const colors = new Set(avatarPoses(who).idle.map((run) => run.color));
      expect(ROBOT_PARTS.some((part) => colors.has(part))).toBe(false);
      expect(colors.has('halo')).toBe(true);
      expect(colors.has('skin')).toBe(true);
      expect(colors.has('hair')).toBe(true);
    }
    const unique = new Set(drawings.map((who) => JSON.stringify(avatarPoses(who).idle)));
    expect(unique.size).toBe(drawings.length);
  });

  test('every agent renders a shadow element under the avatar', () => {
    for (const who of CREW) {
      const { container, unmount } = render(
        <OfficeAgent
          agent={{
            who,
            at: { x: 100, y: 400 },
            pose: 'standing',
            face: 'right',
            queue: [],
            speech: undefined,
            speechSteps: 0,
          }}
          name={who}
        />,
      );
      expect(container.querySelectorAll('[data-shadow]').length).toBe(1);
      unmount();
    }
  });
});

describe('room and desks', () => {
  test('every rectangle is painted with a token and stays inside the floor view', () => {
    const rects = buildRoomArt();
    expect(rects.every((rect) => rect.fill.startsWith('--'))).toBe(true);
    expect(rects.every((rect) => rect.y >= ROOM_VIEW.y && rect.x + rect.w <= ROOM_VIEW.width)).toBe(
      true,
    );
  });

  test('desks stay inside their 72 × 44 drawing and seats are below the screen front', () => {
    for (const side of ['left', 'right'] as const) {
      const rects = buildDeskArt(side, ['chart', 'book', 'heat']);
      expect(
        rects.every((rect) => rect.x >= -1 && rect.x + rect.w <= 72 && rect.y + rect.h <= 44),
      ).toBe(true);
    }
    for (const who of Object.keys(DESKS)) {
      expect(seatOf(who === 'tiago' ? 'tiago' : (who as 'renata')).y).toBeGreaterThanOrEqual(
        FLOOR_TOP,
      );
    }
  });

  test('the drawn room is decorative for screen readers', () => {
    const { container } = render(<RoomArt crew={['tiago', 'alice']} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('[style]')).toBeNull();
  });
});

describe('wall screens', () => {
  test('score pips light up to the score, exactly, and mark the gates', () => {
    const pips = scorePips('2', '2');
    expect(pips.filter((pip) => pip.isOn).map((pip) => pip.value)).toEqual([1, 2]);
    expect(pips.filter((pip) => pip.isGate).map((pip) => pip.value)).toEqual([-2, 2]);
    expect(
      scorePips('-1.5', '2')
        .filter((pip) => pip.isOn)
        .map((pip) => pip.value),
    ).toEqual([-1]);
  });

  test('Fear & Greed comes from the sentiment query, with the source credit', async () => {
    renderApp({
      path: '/',
      isAuthenticated: true,
      routes: [
        {
          method: 'GET',
          path: '/v1/market/sentiment',
          respond: (): Response =>
            dataResponse({
              fearGreed: 27,
              classification: 'Fear',
              date: '2026-10-11',
              source: {
                name: 'alternative.me',
                creditText: 'Fear & Greed Index por alternative.me',
                url: 'https://alternative.me/crypto/fear-and-greed-index/',
              },
            }),
        },
      ],
      probe: <FearGreedScreen />,
    });
    const screenRegion = await screen.findByRole('region', { name: 'Fear & Greed' });
    expect(await within(screenRegion).findByText('27')).toBeTruthy();
    expect(within(screenRegion).getByText('Medo')).toBeTruthy();
    const link = within(screenRegion).getByRole('link', {
      name: 'Fear & Greed Index por alternative.me',
    });
    expect(link.getAttribute('href')).toStartWith('https://');
  });

  test('the heatmap lists the enabled pairs', () => {
    renderApp({
      path: '/',
      isAuthenticated: true,
      probe: (
        <LiveMarketProvider>
          <WallHeatmap symbols={['BTCUSDT', 'ETHUSDT']} />
        </LiveMarketProvider>
      ),
    });
    const map = screen.getByRole('region', { name: 'Mapa de calor · 24 h' });
    expect(within(map).getByText('BTC')).toBeTruthy();
    expect(within(map).getByText('ETH')).toBeTruthy();
  });
});
