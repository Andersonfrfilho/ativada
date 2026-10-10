// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  ADX_INDICATOR,
  ATR_INDICATOR,
  OBV_INDICATOR,
  VWAP_INDICATOR,
} from '../packages/strategy-engine/src/index.js';
import { describeIndicatorConformance } from './fixtures/strategy-engine/indicator-conformance.fixture.js';
import {
  ADX_SPEC,
  ATR_SPEC,
  OBV_SPEC,
  VWAP_SPEC,
} from './fixtures/strategy-engine/oracle/oracle-specs.fixture.js';

describeIndicatorConformance({ oracle: VWAP_SPEC, definition: VWAP_INDICATOR });
describeIndicatorConformance({ oracle: OBV_SPEC, definition: OBV_INDICATOR });
describeIndicatorConformance({ oracle: ATR_SPEC, definition: ATR_INDICATOR });
describeIndicatorConformance({ oracle: ADX_SPEC, definition: ADX_INDICATOR });
