// Copyright (c) 2026 Ada Technology. All rights reserved.
import { expect } from 'bun:test';
import { screen, waitFor } from '@testing-library/react';

import { TEAM_ROOM_TEXT } from '../../src/runs/team-room/team-room.constant.js';

// "Equipe agora" já existe no carregamento (a coluna não some): o teste espera a opinião chegar.
export async function findLoadedTeam(): Promise<HTMLElement> {
  const aside = await screen.findByRole('complementary', { name: TEAM_ROOM_TEXT.COMPACT_TITLE });
  await waitFor(() => expect(aside.textContent).toContain(TEAM_ROOM_TEXT.DISCLAIMER));
  return aside;
}

// As equipes ◆ na sala de operações (spec 011, Fase 3): a seção existe e as fichas chegam.
export async function findRoomModelTeams(): Promise<HTMLElement> {
  const section = await screen.findByRole('region', { name: 'Equipes de modelo na sala' });
  await waitFor(() => expect(section.textContent).not.toBe(''));
  return section;
}
