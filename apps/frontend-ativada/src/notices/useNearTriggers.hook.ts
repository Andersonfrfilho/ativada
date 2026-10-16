// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useQueries } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { API_PATH } from '../app/app.constant.js';
import { useApiClient } from '../app/useAppContext.hook.js';
import { useLiveMarket } from '../live/useLiveMarket.hook.js';
import { RUN_QUERY_ROOT } from '../runs/runs.query.js';
import {
  liveStatusSchema,
  type LiveStatus,
  type RuleTrigger,
} from '../runs/live-tracking/live-status.validation.js';
import { computeNearDistance, formatNearDistance, nearProgress, stepNear } from './near-trigger.js';
import type { LiveRunOption } from './useLiveRunOptions.hook.js';

export type NearTrigger = {
  readonly key: string;
  readonly runId: string;
  readonly symbol: string;
  readonly label: string;
  readonly ruleLabel: string;
  readonly side: 'abaixo' | 'acima';
  readonly threshold: string;
  readonly price: string;
  readonly distanceText: string;
  readonly progress: bigint;
  readonly closesAt: number | null;
};

type Candidate = {
  readonly rule: RuleTrigger;
  readonly candleTime: number;
  readonly status: LiveStatus;
};

// A regra de preço, exata, ainda não atendida e que SOZINHA completa o placar (RF18).
function pickRules(status: LiveStatus): readonly RuleTrigger[] {
  if (status.triggers.status !== 'available') return [];
  if (status.triggers.state !== 'awaiting_entry') return [];
  return status.triggers.rules.filter(
    (rule) =>
      rule.metric === 'close_price' &&
      rule.basis === 'exact' &&
      !rule.isMet &&
      rule.completesScore === true &&
      rule.threshold !== null,
  );
}

function toCandidates(status: LiveStatus | undefined): readonly Candidate[] {
  const candleTime = status?.decisions.items[0]?.candleTime;
  if (status === undefined || candleTime === undefined) return [];
  return pickRules(status).map((rule) => ({ rule, candleTime, status }));
}

type Evaluation = { readonly trigger: NearTrigger; readonly isNear: boolean };

function evaluate(params: {
  readonly option: LiveRunOption;
  readonly candidate: Candidate;
  readonly price: string;
  readonly wasNear: boolean;
}): Evaluation | undefined {
  const { option, candidate, price, wasNear } = params;
  const { rule } = candidate;
  if (rule.threshold === null) return undefined;
  const distance = computeNearDistance({
    direction: rule.direction,
    threshold: rule.threshold,
    price,
  });
  const isNear = stepNear(wasNear, distance);
  if (distance === undefined) return undefined;
  const key = `${option.runId}|${candidate.candleTime}|${rule.ruleId}`;
  return {
    isNear,
    trigger: {
      key,
      runId: option.runId,
      symbol: option.symbol,
      label: option.label,
      ruleLabel: rule.label,
      side: rule.direction === 'below' ? 'abaixo' : 'acima',
      threshold: rule.threshold,
      price,
      distanceText: formatNearDistance(distance),
      progress: nearProgress(distance),
      closesAt: candidate.status.run.nextDecisionAt,
    },
  };
}

function useMarkedStatuses(marked: readonly LiveRunOption[]): readonly (LiveStatus | undefined)[] {
  const client = useApiClient();
  const results = useQueries({
    queries: marked.map((option) => ({
      queryKey: [RUN_QUERY_ROOT, option.runId, 'live-status'],
      queryFn: (): Promise<LiveStatus> =>
        client.request({
          path: `${API_PATH.RUNS}/${option.runId}/live-status`,
          schema: liveStatusSchema,
        }),
    })),
  });
  return results.map((result) => result.data);
}

function evaluateMarked(params: {
  readonly marked: readonly LiveRunOption[];
  readonly statuses: readonly (LiveStatus | undefined)[];
  readonly wasNear: ReadonlySet<string>;
  readonly freshPrice: (symbol: string) => { readonly price: string } | undefined;
}): readonly Evaluation[] {
  return params.marked.flatMap((option, index) => {
    const price = params.freshPrice(option.symbol)?.price;
    if (price === undefined) return [];
    return toCandidates(params.statuses[index]).flatMap((candidate) => {
      const key = `${option.runId}|${candidate.candleTime}|${candidate.rule.ruleId}`;
      return evaluate({ option, candidate, price, wasNear: params.wasNear.has(key) }) ?? [];
    });
  });
}

// RF18 (D4-A): o aviso antecipado só existe para a simulação marcada; uma vez por (simulação, vela, regra), com histerese
// de 0,3% a 0,6%; fechar a vela troca a chave e o aviso some. Nada por tick além de uma comparação em BigInt.
export function useNearTriggers(params: {
  readonly options: readonly LiveRunOption[];
  readonly earlyRunIds: readonly string[];
}): { readonly nearTriggers: readonly NearTrigger[]; readonly dismissNear: (key: string) => void } {
  const { freshPrice } = useLiveMarket();
  const marked = params.options.filter(
    (option) => option.isRunning && params.earlyRunIds.includes(option.runId),
  );
  const statuses = useMarkedStatuses(marked);
  const wasNear = useRef<ReadonlySet<string>>(new Set());
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const evaluations = evaluateMarked({ marked, statuses, wasNear: wasNear.current, freshPrice });
  useEffect(() => {
    wasNear.current = new Set(
      evaluations.filter((entry) => entry.isNear).map((entry) => entry.trigger.key),
    );
  });
  const dismissNear = useCallback((key: string): void => {
    setDismissed((current) => new Set([...current, key]));
  }, []);
  const nearTriggers = evaluations
    .filter((entry) => entry.isNear && !dismissed.has(entry.trigger.key))
    .map((entry) => entry.trigger);
  return { nearTriggers, dismissNear };
}
