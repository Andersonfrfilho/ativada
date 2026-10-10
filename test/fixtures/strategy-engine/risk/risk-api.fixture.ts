// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  computePositionSize,
  computeProtectivePrices,
  type ComputeProtectivePricesParams,
  type PositionSizeParams,
  type PositionSizeResult,
  type ProtectivePricesResult,
} from '../../../../packages/strategy-engine/src/index.js';

export type RiskApi = {
  readonly computePositionSize: (params: PositionSizeParams) => PositionSizeResult;
  readonly computeProtectivePrices: (
    params: ComputeProtectivePricesParams,
  ) => ProtectivePricesResult;
};

export const PRODUCTION_RISK_API: RiskApi = { computePositionSize, computeProtectivePrices };
