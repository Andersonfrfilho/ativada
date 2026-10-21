// Copyright (c) 2026 Ada Technology. All rights reserved.
import {
  buildGoldenCases,
  recordGoldenCase,
} from '../test/fixtures/risk-analyst/analyst-golden-cases.fixture.js';
import { loadRiskAnalystApi } from '../test/fixtures/risk-analyst/risk-analyst-api.fixture.js';

// Regrava o dourado da regra `analyst-1` (T1.4 da spec 007) com o código de PRODUÇÃO. Mudar a regra exige `analyst-2` e
// este dourado regravado; sem argumento, escreve ao lado do fixture; com um caminho, escreve nele.
//   bun run scripts/record-risk-analyst-golden.ts [caminho do analyst-golden.fixture.ts]

const DEFAULT_OUTPUT = new URL(
  '../test/fixtures/risk-analyst/analyst-golden.fixture.ts',
  import.meta.url,
).pathname;

const api = await loadRiskAnalystApi();
const lines = buildGoldenCases(api).map(({ id, input }) => {
  const record = recordGoldenCase(api, input);
  if (record.includes("'") || record.includes('\\')) {
    throw new Error(`O caso ${id} tem aspas simples ou barra invertida: ajuste o gravador.`);
  }
  return `  '${id}':\n    '${record}',`;
});

const text = `// Copyright (c) 2026 Ada Technology. All rights reserved.

// Dourado LITERAL da regra \`analyst-1\` (T1.4 da spec 007): a decisão inteira e as frases dela em 12 casos, 6 do recorte
// REAL de 15 min (BTCUSDT, 3.300 velas e o Fear & Greed do banco) e 6 de um mercado SINTÉTICO de 3.000 velas, em instantes
// e com carteiras diferentes. Regravar: \`bun run scripts/record-risk-analyst-golden.ts\`. Mudar a regra exige \`analyst-2\`.
export const ANALYST_GOLDEN: Readonly<Record<string, string>> = {
${lines.join('\n')}
};
`;

await Bun.write(Bun.argv[2] ?? DEFAULT_OUTPUT, text);
console.log(`dourado gravado: ${lines.length} casos`);
