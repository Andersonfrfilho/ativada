// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  BOLLINGER_INDICATOR,
  RSI_INDICATOR,
  Z_SCORE_INDICATOR,
} from '../packages/strategy-engine/src/index.js';
import { describeIndicatorConformance } from './fixtures/strategy-engine/indicator-conformance.fixture.js';
import {
  BOLLINGER_SPEC,
  RSI_SPEC,
  ZSCORE_SPEC,
} from './fixtures/strategy-engine/oracle/oracle-specs.fixture.js';

describeIndicatorConformance({ oracle: RSI_SPEC, definition: RSI_INDICATOR });
describeIndicatorConformance({ oracle: BOLLINGER_SPEC, definition: BOLLINGER_INDICATOR });
describeIndicatorConformance({ oracle: ZSCORE_SPEC, definition: Z_SCORE_INDICATOR });
