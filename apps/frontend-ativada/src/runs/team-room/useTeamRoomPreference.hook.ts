// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState } from 'react';

import {
  readTeamRoomPreference,
  writeTeamRoomPreference,
  type TeamRoomPreference,
} from './team-room-preference.js';

export type TeamRoomPreferenceControls = {
  readonly preference: TeamRoomPreference;
  readonly update: (change: Partial<TeamRoomPreference>) => void;
};

export function useTeamRoomPreference(): TeamRoomPreferenceControls {
  const [preference, setPreference] = useState<TeamRoomPreference>(() => readTeamRoomPreference());
  function update(change: Partial<TeamRoomPreference>): void {
    const next = { ...preference, ...change };
    setPreference(next);
    writeTeamRoomPreference(next);
  }
  return { preference, update };
}
