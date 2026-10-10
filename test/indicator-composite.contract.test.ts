// Copyright (c) 2026 Ada Technology. All rights reserved.
import { EMA_CROSS_INDICATOR, OBV_TREND_INDICATOR } from '../packages/strategy-engine/src/index.js';
import { describeIndicatorConformance } from './fixtures/strategy-engine/indicator-conformance.fixture.js';
import {
  EMA_CROSS_SPEC,
  OBV_TREND_SPEC,
} from './fixtures/strategy-engine/oracle/oracle-specs.fixture.js';

describeIndicatorConformance({ oracle: EMA_CROSS_SPEC, definition: EMA_CROSS_INDICATOR });
describeIndicatorConformance({ oracle: OBV_TREND_SPEC, definition: OBV_TREND_INDICATOR });
