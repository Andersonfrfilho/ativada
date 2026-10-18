// Copyright (c) 2026 Ada Technology. All rights reserved.
import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

const MINIMUM_TARGET_PIXELS = 44;

function readStyle(path: string): string {
  return readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
}

function declaredMinHeight(css: string, selector: string): number {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} ausente`).toBeGreaterThanOrEqual(0);
  const block = css.slice(start, css.indexOf('}', start));
  const match = /min-height:\s*(\d+)px/.exec(block);
  return Number(match?.[1] ?? 0);
}

const TARGETS: readonly (readonly [string, string])[] = [
  ['styles/Controls.module.css', '.button'],
  ['styles/Controls.module.css', '.input'],
  ['styles/Controls.module.css', '.textLink'],
  ['layout/AppShell.module.css', '.link'],
  ['goals/Goals.module.css', '.link'],
  ['goals/Goals.module.css', '.checkbox'],
  ['backtests/Backtests.module.css', '.link'],
  ['backtests/Backtests.module.css', '.pick'],
  ['backtests/BacktestGroups.module.css', '.pick'],
  ['backtests/BacktestGroups.module.css', '.pairLink'],
  ['backtests/BacktestGroups.module.css', '.sortButton'],
  ['backtests/BacktestGroups.module.css', '.groupSummary'],
  ['backtests/RunListToolbar.module.css', '.chip'],
  ['strategies/Strategies.module.css', '.name'],
  ['glossary/Term.module.css', '.trigger'],
  ['runs/live-tracking/Decisions.module.css', '.expand'],
  ['runs/live-tracking/Decisions.module.css', '.more'],
  ['runs/live-tracking/LiveTracking.module.css', '.link'],
  ['runs/team-room/TeamRoomCard.module.css', '.tool'],
  ['runs/team-room/TeamRoomCard.module.css', '.switchButton'],
  ['runs/team-room/TeamRoomCard.module.css', '.linesSummary'],
  ['runs/team-room/office/Office.module.css', '.badgeButton'],
  ['runs/analyst/Analyst.module.css', '.more'],
  ['backtests/run-switch/RunSwitcher.module.css', '.trigger'],
  ['backtests/run-switch/RunSwitcher.module.css', '.option'],
  ['backtests/run-switch/RunSwitcher.module.css', '.searchInput'],
  ['notices/Notices.module.css', '.bell'],
  ['notices/Notices.module.css', '.close'],
  ['notices/Notices.module.css', '.action'],
  ['notices/Notices.module.css', '.chip'],
  ['notices/Notices.module.css', '.textButton'],
  ['notices/Notices.module.css', '.switch'],
  ['notices/Notices.module.css', '.coachButton'],
  ['notices/Notices.module.css', '.more'],
  ['overview/LiveSimulations.module.css', '.chip'],
  ['overview/LiveSimulations.module.css', '.featureButton'],
  ['overview/LiveSimulations.module.css', '.summaryToggle'],
  ['overview/LiveSimulations.module.css', '.pastLink'],
  ['runs/team-room/balcony/Balcony.module.css', '.modelButton'],
  ['runs/model-teams/ModelTeamSheet.module.css', '.link'],
  ['account/model-teams/ModelTeamsCard.module.css', '.switch'],
  ['runs/model-teams/TeamComparison.module.css', '.summary'],
  ['runs/duel/Duel.module.css', '.link'],
  ['runs/duel/Duel.module.css', '.pick'],
];

describe('alvos de toque', () => {
  for (const [path, selector] of TARGETS) {
    test(`${selector} em ${path} tem pelo menos ${MINIMUM_TARGET_PIXELS} px de altura`, () => {
      expect(declaredMinHeight(readStyle(path), selector)).toBeGreaterThanOrEqual(
        MINIMUM_TARGET_PIXELS,
      );
    });
  }
});
