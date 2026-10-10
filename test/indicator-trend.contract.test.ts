// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  DONCHIAN_INDICATOR,
  EMA_INDICATOR,
  MACD_INDICATOR,
  SMA_INDICATOR,
} from '../packages/strategy-engine/src/index.js';
import { describeIndicatorConformance } from './fixtures/strategy-engine/indicator-conformance.fixture.js';
import {
  DONCHIAN_SPEC,
  EMA_SPEC,
  MACD_SPEC,
  SMA_SPEC,
} from './fixtures/strategy-engine/oracle/oracle-specs.fixture.js';

describeIndicatorConformance({ oracle: SMA_SPEC, definition: SMA_INDICATOR });
describeIndicatorConformance({ oracle: EMA_SPEC, definition: EMA_INDICATOR });
describeIndicatorConformance({ oracle: MACD_SPEC, definition: MACD_INDICATOR });
describeIndicatorConformance({ oracle: DONCHIAN_SPEC, definition: DONCHIAN_INDICATOR });
