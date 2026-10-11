// Copyright (c) 2026 Ada Technology. All rights reserved.
import { z } from '@cryptoada/environment';

export const strategySchema = z.object({
  id: z.string(),
  name: z.string(),
  isExample: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const versionSchema = z.object({
  id: z.string(),
  strategyId: z.string(),
  version: z.number(),
  config: z.record(z.string(), z.unknown()),
  configHash: z.string(),
  createdAt: z.string(),
});

export const strategyDetailSchema = strategySchema.extend({
  latestVersion: versionSchema.nullable(),
});

export const createdStrategySchema = z.object({ strategy: strategySchema, version: versionSchema });
export const addedVersionSchema = z.object({ version: versionSchema });

export type Strategy = z.infer<typeof strategySchema>;
export type StrategyVersion = z.infer<typeof versionSchema>;
export type StrategyDetail = z.infer<typeof strategyDetailSchema>;

export type VersionLabel = {
  readonly strategyId: string;
  readonly strategyName: string;
  readonly version: number;
  readonly configHash: string;
};

const SHORT_HASH_LENGTH = 8;

export function shortHash(configHash: string): string {
  return configHash.slice(0, SHORT_HASH_LENGTH);
}

export function describeVersion(label: VersionLabel | undefined): string {
  return label === undefined
    ? 'Estratégia removida'
    : `${label.strategyName} · versão ${label.version}`;
}
