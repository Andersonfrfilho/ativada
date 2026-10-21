// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  buildEntryScaleGolden,
  ENTRY_SCALE_GOLDEN_PATH,
} from '../test/fixtures/strategy-engine/production/engine-scale-golden.fixture.js';

// Grava o dourado do teto de entrada por passo (ADR 0002 A21): rode só ao mudar ENGINE_VERSION ou o ciclo.
await Bun.write(ENTRY_SCALE_GOLDEN_PATH, `${JSON.stringify(buildEntryScaleGolden(), null, 2)}\n`);
console.log(`Dourado gravado em ${ENTRY_SCALE_GOLDEN_PATH}`);
