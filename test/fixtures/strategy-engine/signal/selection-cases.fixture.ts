// Copyright (c) 2026 Ada Technology. All rights reserved.
import type {
  SentimentObservation,
  StoredSentimentObservation,
} from '../../../../packages/strategy-engine/src/index.js';
import { SENTIMENT_SOURCE } from './scoreboard-configs.fixture.js';
import type { SignalApi } from './signal-api.fixture.js';

export const SELECTION_CLOSE = 5_000;
export const SELECTION_CUTOFF = 4_000;
const OTHER_SOURCE = 'outra-fonte';

export function stored(overrides: Partial<StoredSentimentObservation>): StoredSentimentObservation {
  return {
    value: 50,
    observedAt: 1_000,
    source: SENTIMENT_SOURCE,
    createdAt: 1_000,
    ...overrides,
  };
}

function plain(value: number, observedAt: number): SentimentObservation {
  return { value, observedAt, source: SENTIMENT_SOURCE };
}

export type SelectionCase = {
  readonly label: string;
  readonly observations: readonly StoredSentimentObservation[];
  readonly expected: SentimentObservation | undefined;
};

export const SELECTION_CASES: readonly SelectionCase[] = [
  {
    label: 'keeps only the run source',
    observations: [
      stored({ value: 10 }),
      stored({ value: 1, observedAt: 3_000, source: OTHER_SOURCE }),
    ],
    expected: plain(10, 1_000),
  },
  {
    label: 'ignores a row inserted after the run start, even if its observation time is older',
    observations: [
      stored({ value: 10 }),
      stored({ value: 1, observedAt: 3_000, createdAt: SELECTION_CUTOFF + 1 }),
    ],
    expected: plain(10, 1_000),
  },
  {
    label: 'a row inserted exactly at the cutoff still counts',
    observations: [
      stored({ value: 10 }),
      stored({ value: 2, observedAt: 2_000, createdAt: SELECTION_CUTOFF }),
    ],
    expected: plain(2, 2_000),
  },
  {
    label: 'an observation available only after the close is ignored',
    observations: [stored({ value: 4, observedAt: SELECTION_CLOSE + 1, createdAt: 2_000 })],
    expected: undefined,
  },
  {
    label: 'an observation available exactly at the close counts',
    observations: [
      stored({ value: 10 }),
      stored({ value: 3, observedAt: SELECTION_CLOSE, createdAt: 2_000 }),
      stored({ value: 4, observedAt: SELECTION_CLOSE + 1, createdAt: 2_000 }),
    ],
    expected: plain(3, SELECTION_CLOSE),
  },
  {
    label: 'a tie on the observation time goes to the later insertion order',
    observations: [
      stored({ value: 11, observedAt: 2_000 }),
      stored({ value: 22, observedAt: 2_000 }),
    ],
    expected: plain(22, 2_000),
  },
  {
    label: 'the latest observation wins over an older one listed after it',
    observations: [
      stored({ value: 22, observedAt: 2_000 }),
      stored({ value: 33, observedAt: 1_500 }),
    ],
    expected: plain(22, 2_000),
  },
  { label: 'no row is no observation', observations: [], expected: undefined },
  {
    label: 'only rows of another source is no observation',
    observations: [stored({ source: OTHER_SOURCE })],
    expected: undefined,
  },
];

export function select(
  api: SignalApi,
  observations: readonly StoredSentimentObservation[],
): SentimentObservation | undefined {
  return api.selectAvailableSentiment({
    observations,
    closeTime: SELECTION_CLOSE,
    source: SENTIMENT_SOURCE,
    insertionCutoff: SELECTION_CUTOFF,
  });
}

export function findFirstSelectionMismatch(api: SignalApi): string | undefined {
  const wrong = SELECTION_CASES.find(
    (selectionCase) =>
      JSON.stringify(select(api, selectionCase.observations)) !==
      JSON.stringify(selectionCase.expected),
  );
  return wrong?.label;
}
