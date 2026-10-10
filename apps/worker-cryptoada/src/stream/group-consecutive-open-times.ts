// Copyright (c) 2026 Ada Technology. All rights reserved.
export type OpenTimeInterval = {
  readonly from: number;
  readonly to: number;
};

export type GroupOpenTimesParams = {
  readonly openTimes: readonly number[];
  readonly durationMilliseconds: number;
};

// Aberturas em ordem crescente; `to` é a última abertura do intervalo (inclusiva), como o endTime da Binance.
export function groupConsecutiveOpenTimes(
  params: GroupOpenTimesParams,
): readonly OpenTimeInterval[] {
  const intervals: OpenTimeInterval[] = [];
  for (const openTime of params.openTimes) {
    const last = intervals.at(-1);
    if (last !== undefined && openTime - last.to === params.durationMilliseconds) {
      intervals[intervals.length - 1] = { from: last.from, to: openTime };
      continue;
    }
    intervals.push({ from: openTime, to: openTime });
  }
  return intervals;
}
