// Copyright (c) 2026 Ada Technology. All rights reserved.
import { PROJECTION_SUMMARY_GOLDEN } from '../../../test/fixtures/projections/projection-summary-golden.fixture.js';
import {
  PROJECTION_DATASET_KEYS,
  PROJECTION_STRATEGIES,
  numericText,
  runDecidedCandles,
} from '../../../test/fixtures/projections/projection-dataset.fixture.js';
import {
  summarizeOracle,
  type OraclePrediction,
  type OracleSummary,
} from '../../../test/fixtures/projections/projection-summary-oracle.fixture.js';
import { REAL_DATASETS } from '../../../test/fixtures/strategy-engine/signal/classic-signals.fixture.js';
import type { EngineCandle } from '../../strategy-engine/src/index.js';
import { EngineDecimal } from '../../strategy-engine/src/index.js';
import { createCandleRepository } from '../src/candles/candle.repository.js';
import type { CandleRecord } from '../src/candles/candle.types.js';
import { createRunBatchRepository } from '../src/run-results/run-batch.repository.js';
import { createRunProjectionRepository } from '../src/run-results/run-projections.js';
import type {
  ProjectionCounts,
  ProjectionReadParams,
  ProjectionSegment,
} from '../src/run-results/run-projections.types.js';
import { REGIME, SIGNAL_ACTION } from '../src/run-results/run-result.constant.js';
import type { SignalInput } from '../src/run-results/run-result.types.js';
import { RUN_KIND } from '../src/runs/run.constant.js';
import type { LifecycleCheckContext } from './account-lifecycle-checks.js';
import { resolvePersistenceOwner, seedRun, type PersistenceOwner } from './persistence-seed.js';

const EXCHANGE = 'binance';
const CLOCK_MILLISECONDS = Date.UTC(2030, 0, 1);
const HOUR = 3_600_000;
const SYNTHETIC_SYMBOL = 'PROJSYN';
const SYNTHETIC_FIRST = 1_800_000_000_000;
const SYNTHETIC_CANDLES = 61;
const MISSING_INDEX = 20;
const TIE_INDEX = 31;
const RANGE_END_INDEX = 60;
const SEGMENTS_END_INDEX = 50;
const DATASET_SYMBOLS = ['PROJBTC', 'PROJETH'] as const;

type SeededRun = { readonly owner: PersistenceOwner; readonly runId: string };

const canonical = (text: string): string => new EngineDecimal(text).toFixed();

function toCandleRecord(params: {
  readonly candle: EngineCandle;
  readonly symbol: string;
}): CandleRecord {
  const { candle } = params;
  return {
    exchange: EXCHANGE,
    symbol: params.symbol,
    timeframe: candle.timeframe,
    openTime: candle.openTime,
    closeTime: candle.closeTime,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    tradeCount: 1,
  };
}

async function seedRunWithSignals(params: {
  readonly context: LifecycleCheckContext;
  readonly owner: PersistenceOwner;
  readonly market: { readonly symbol: string; readonly timeframe: string };
  readonly signals: readonly SignalInput[];
}): Promise<string> {
  const { context, owner, market, signals } = params;
  const run = await seedRun(context.handle, owner, {
    kind: RUN_KIND.BACKTEST,
    symbol: market.symbol,
    timeframe: market.timeframe,
  });
  await createRunBatchRepository(context.handle).runInBatch(owner.scope, run.id, (writer) =>
    writer.appendResults({
      signals,
      orders: [],
      fills: [],
      positions: [],
      equityPoints: [],
      commands: [],
    }),
  );
  return run.id;
}

function expectedCounts(summary: OracleSummary): ProjectionCounts {
  const strength = (name: 'weak' | 'strong' | 'decided'): { hits: number; misses: number } => ({
    hits: summary.byStrength[name].hits,
    misses: summary.byStrength[name].counted - summary.byStrength[name].hits,
  });
  return {
    noSide: summary.noSide,
    pending: summary.pending,
    hits: summary.hits,
    misses: summary.misses,
    ties: summary.ties,
    upMoves: summary.upMoves,
    banded: summary.banded,
    inside: summary.inside,
    byStrength: {
      weak: strength('weak'),
      strong: strength('strong'),
      decided: strength('decided'),
    },
  };
}

function assertSameCounts(
  context: LifecycleCheckContext,
  params: {
    readonly actual: ProjectionCounts;
    readonly expected: ProjectionCounts;
    readonly label: string;
  },
): void {
  context.assertCondition(
    JSON.stringify(params.actual) === JSON.stringify(params.expected),
    `previsões (${params.label}): o resumo SQL ${JSON.stringify(params.actual)} difere do oráculo ${JSON.stringify(params.expected)}`,
  );
}

async function checkRealDatasets(context: LifecycleCheckContext): Promise<void> {
  const owner = await resolvePersistenceOwner(context.handle, 'subject-projection-real');
  const reads = createRunProjectionRepository(context.handle);
  const candles = createCandleRepository(context.handle, { now: () => CLOCK_MILLISECONDS });
  for (const [datasetIndex, dataset] of REAL_DATASETS.entries()) {
    const symbol = DATASET_SYMBOLS[datasetIndex] ?? 'PROJX';
    const datasetKey = PROJECTION_DATASET_KEYS[datasetIndex];
    if (datasetKey === undefined) throw new Error('conjunto real sem chave no dourado');
    await candles.upsertCandles(
      dataset.candles.map((candle) => toCandleRecord({ candle, symbol })),
    );
    const first = dataset.candles[0];
    const last = dataset.candles.at(-1);
    if (first === undefined || last === undefined) throw new Error('conjunto real vazio');
    const duration = first.closeTime + 1 - first.openTime;
    for (const [strategyName, strategy] of PROJECTION_STRATEGIES) {
      const decided = runDecidedCandles(dataset, strategy);
      const signals = decided.map(({ signal }) => toSignalInput(signal));
      const runId = await seedRunWithSignals({
        context,
        owner,
        market: { symbol, timeframe: first.timeframe },
        signals,
      });
      const params: ProjectionReadParams = {
        market: { exchange: EXCHANGE, symbol, timeframe: first.timeframe },
        durationMilliseconds: duration,
        rangeEnd: last.openTime + duration,
        segments: [
          {
            startTime: first.openTime,
            endTime: last.openTime + duration,
            buy: strategy.config.thresholds.buy,
            sell: strategy.config.thresholds.sell,
          },
        ],
      };
      const golden = PROJECTION_SUMMARY_GOLDEN[`${datasetKey}:${strategyName}`];
      const counts = await reads.summarizeProjections(owner.scope, runId, params);
      assertSameCounts(context, {
        actual: counts,
        expected: expectedCounts(golden),
        label: `${dataset.name} · ${strategyName}`,
      });
      await checkItemsAgainstOracle({ context, reads, owner, runId, params, decided });
    }
  }
  context.reportCheck(
    'previsões: o resumo SQL (LEAD) é igual ao oráculo e ao dourado nos dois conjuntos reais × Placar clássico e Donchian + MACD; as páginas de itens batem com o oráculo',
  );
}

function toSignalInput(signal: {
  readonly candleOpenTime: number;
  readonly action: SignalInput['action'];
  readonly score: string;
  readonly regime: SignalInput['regime'];
  readonly votes: SignalInput['votes'];
  readonly indicators: SignalInput['indicators'];
  readonly reason: string;
}): SignalInput {
  return {
    candleTime: signal.candleOpenTime,
    action: signal.action,
    score: signal.score,
    regime: signal.regime,
    votes: signal.votes,
    indicators: signal.indicators,
    sentimentObservation: undefined,
    reason: signal.reason,
  };
}

async function checkItemsAgainstOracle(params: {
  readonly context: LifecycleCheckContext;
  readonly reads: ReturnType<typeof createRunProjectionRepository>;
  readonly owner: PersistenceOwner;
  readonly runId: string;
  readonly params: ProjectionReadParams;
  readonly decided: ReturnType<typeof runDecidedCandles>;
}): Promise<void> {
  const { context, reads, owner, runId, decided } = params;
  const items = [];
  let before: number | undefined;
  for (let page = 0; page < 20; page += 1) {
    const result = await reads.listProjectionItems(owner.scope, runId, {
      ...params.params,
      before,
      limit: 100,
    });
    items.push(...result.items);
    before = result.nextBefore;
    if (before === undefined) break;
  }
  const expected = [...decided].reverse();
  context.assertCondition(
    items.length === expected.length && before === undefined,
    `previsões: as páginas somam ${items.length} itens e eram esperados ${expected.length}`,
  );
  const isSame = items.every((item, index) => {
    const oracle = expected[index];
    if (oracle === undefined) return false;
    const atr = numericText(oracle.signal.indicators['risk:atr']);
    const isContiguous =
      oracle.next !== undefined && oracle.next.openTime === oracle.candle.closeTime + 1;
    return (
      item.candleTime === oracle.candle.openTime &&
      canonical(item.close) === canonical(oracle.candle.close) &&
      (item.atr === null ? atr === null : atr !== null && canonical(item.atr) === atr) &&
      (item.nextClose === null
        ? !isContiguous
        : isContiguous && canonical(item.nextClose) === canonical(oracle.next?.close ?? 'x'))
    );
  });
  context.assertCondition(
    isSame,
    'previsões: um item não bate com a vela, o ATR ou o fechamento seguinte do oráculo',
  );
}

function priceAt(index: number): number {
  return 100 + ((index * 13) % 17) - 8;
}

function syntheticPrice(index: number): number {
  return index === TIE_INDEX ? priceAt(index - 1) : priceAt(index);
}

function syntheticCloseAt(index: number): string {
  return `${syntheticPrice(index)}.00000000`;
}

const timeAt = (index: number): number => SYNTHETIC_FIRST + index * HOUR;

function buildSyntheticCandles(): readonly CandleRecord[] {
  return Array.from({ length: SYNTHETIC_CANDLES }, (_unused, index) => index)
    .filter((index) => index !== MISSING_INDEX)
    .map((index) => ({
      exchange: EXCHANGE,
      symbol: SYNTHETIC_SYMBOL,
      timeframe: '1h' as const,
      openTime: timeAt(index),
      closeTime: timeAt(index) + HOUR - 1,
      open: syntheticCloseAt(index),
      high: `${syntheticPrice(index) + 3}.00000000`,
      low: `${syntheticPrice(index) - 3}.00000000`,
      close: syntheticCloseAt(index),
      volume: '1.00000000',
      tradeCount: 1,
    }));
}

function syntheticScore(index: number): string {
  return String((((index * 7) % 9) - 4) * 0.5);
}

function syntheticAtr(index: number): number | null {
  return index % 5 === 0 ? null : 1.5;
}

function buildSyntheticSignals(): readonly SignalInput[] {
  return Array.from({ length: RANGE_END_INDEX - 1 }, (_unused, offset) => offset + 1)
    .filter((index) => index !== MISSING_INDEX)
    .map((index) => ({
      candleTime: timeAt(index),
      action: SIGNAL_ACTION.HOLD,
      score: syntheticScore(index),
      regime: REGIME.TRENDING,
      votes: [],
      indicators: { 'risk:atr': syntheticAtr(index), 'rule:ema-9-21.fast': priceAt(index) },
      sentimentObservation: undefined,
      reason: `Sinal sintético ${index}`,
    }));
}

const SEGMENTS: readonly ProjectionSegment[] = [
  { startTime: timeAt(1), endTime: timeAt(30), buy: '2', sell: '-2' },
  { startTime: timeAt(30), endTime: timeAt(SEGMENTS_END_INDEX), buy: '1.5', sell: '-1.5' },
];

function thresholdsOf(index: number): { readonly buy: string; readonly sell: string } | undefined {
  return SEGMENTS.find(
    (segment) => timeAt(index) >= segment.startTime && timeAt(index) < segment.endTime,
  );
}

function buildSyntheticPredictions(): readonly OraclePrediction[] {
  const predictions: OraclePrediction[] = [];
  for (let index = 1; index < RANGE_END_INDEX; index += 1) {
    const thresholds = thresholdsOf(index);
    if (index === MISSING_INDEX || thresholds === undefined) continue;
    const hasNext = index + 1 < SEGMENTS_END_INDEX && index + 1 !== MISSING_INDEX;
    const atr = syntheticAtr(index);
    predictions.push({
      candleTime: timeAt(index),
      score: syntheticScore(index),
      close: syntheticCloseAt(index),
      atr: atr === null ? null : String(atr),
      nextClose: hasNext ? syntheticCloseAt(index + 1) : undefined,
      buyThreshold: thresholds.buy,
      sellThreshold: thresholds.sell,
    });
  }
  return predictions;
}

async function seedSyntheticRun(
  context: LifecycleCheckContext,
  subject: string,
): Promise<SeededRun> {
  const owner = await resolvePersistenceOwner(context.handle, subject);
  await createCandleRepository(context.handle, { now: () => CLOCK_MILLISECONDS }).upsertCandles(
    buildSyntheticCandles(),
  );
  const runId = await seedRunWithSignals({
    context,
    owner,
    market: { symbol: SYNTHETIC_SYMBOL, timeframe: '1h' },
    signals: buildSyntheticSignals(),
  });
  return { owner, runId };
}

const SYNTHETIC_PARAMS: ProjectionReadParams = {
  market: { exchange: EXCHANGE, symbol: SYNTHETIC_SYMBOL, timeframe: '1h' },
  durationMilliseconds: HOUR,
  rangeEnd: timeAt(SEGMENTS_END_INDEX),
  segments: SEGMENTS,
};

async function checkSyntheticSummary(context: LifecycleCheckContext): Promise<SeededRun> {
  const seeded = await seedSyntheticRun(context, 'subject-projection-synthetic');
  const reads = createRunProjectionRepository(context.handle);
  const counts = await reads.summarizeProjections(
    seeded.owner.scope,
    seeded.runId,
    SYNTHETIC_PARAMS,
  );
  const oracle = summarizeOracle(buildSyntheticPredictions());
  assertSameCounts(context, {
    actual: counts,
    expected: expectedCounts(oracle),
    label: 'sintético: lacuna, fim da faixa, dois limiares e janela parada fora',
  });
  context.assertCondition(
    oracle.ties > 0 && oracle.pending >= 2 && oracle.banded > 0,
    'previsões: o cenário sintético deveria ter empate, ao menos 2 pendentes (lacuna e fim) e faixa',
  );
  context.reportCheck(
    `previsões: lacuna de vela e fim da faixa viram pendentes, empate não conta, dois limiares por trecho e o trecho parado (índices 50 a 59) fica fora: ${oracle.hits} acertos, ${oracle.misses} erros, ${oracle.ties} empates, ${oracle.pending} pendentes`,
  );
  return seeded;
}

async function checkSyntheticItems(
  context: LifecycleCheckContext,
  seeded: SeededRun,
): Promise<void> {
  const reads = createRunProjectionRepository(context.handle);
  const collected: { candleTime: number; nextClose: string | null; buy: string; sell: string }[] =
    [];
  let before: number | undefined;
  let pages = 0;
  do {
    const page = await reads.listProjectionItems(seeded.owner.scope, seeded.runId, {
      ...SYNTHETIC_PARAMS,
      before,
      limit: 7,
    });
    collected.push(...page.items);
    before = page.nextBefore;
    pages += 1;
  } while (before !== undefined && pages < 20);
  const expected = buildSyntheticPredictions()
    .map((p) => p.candleTime)
    .reverse();
  context.assertCondition(
    collected.map((item) => item.candleTime).join() === expected.join(),
    `previsões: as páginas concatenadas (${collected.length}) deveriam ser a lista inteira decrescente (${expected.length})`,
  );
  const gap = collected.find((item) => item.candleTime === timeAt(MISSING_INDEX - 1));
  const edge = collected.find((item) => item.candleTime === timeAt(29));
  const second = collected.find((item) => item.candleTime === timeAt(30));
  context.assertCondition(
    gap?.nextClose === null,
    'previsões: a vela antes da lacuna não tem fechamento seguinte',
  );
  context.assertCondition(
    edge?.nextClose !== null &&
      edge?.nextClose !== undefined &&
      canonical(edge.nextClose) === canonical(syntheticCloseAt(30)),
    'previsões: a última vela de um trecho enxerga a primeira do trecho seguinte',
  );
  context.assertCondition(
    edge?.buy === '2' && second?.buy === '1.5' && second.sell === '-1.5',
    'previsões: cada item leva o limiar do trecho dele',
  );
  context.reportCheck(
    `previsões: ${collected.length} itens em ${pages} páginas decrescentes sem repetir, limiar do trecho em cada item`,
  );
}

async function checkProjectionIsolation(
  context: LifecycleCheckContext,
  seeded: SeededRun,
): Promise<void> {
  const stranger = await resolvePersistenceOwner(context.handle, 'subject-projection-stranger');
  const reads = createRunProjectionRepository(context.handle);
  const counts = await reads.summarizeProjections(stranger.scope, seeded.runId, SYNTHETIC_PARAMS);
  const total =
    counts.noSide + counts.pending + counts.hits + counts.misses + counts.ties + counts.banded;
  context.assertCondition(total === 0, 'previsões: outro dono leu o resumo');
  const items = await reads.listProjectionItems(stranger.scope, seeded.runId, {
    ...SYNTHETIC_PARAMS,
    before: undefined,
    limit: 10,
  });
  context.assertCondition(items.items.length === 0, 'previsões: outro dono leu as previsões');
  const layers = await reads.listLayerRows(stranger.scope, seeded.runId, {
    range: { from: timeAt(0), to: timeAt(RANGE_END_INDEX) },
    limit: 10,
  });
  context.assertCondition(layers.length === 0, 'previsões: outro dono leu as camadas');
  context.reportCheck(
    'previsões: dono alheio recebe contagens zeradas e listas vazias nas três leituras',
  );
}

async function checkLayerRows(context: LifecycleCheckContext, seeded: SeededRun): Promise<void> {
  const reads = createRunProjectionRepository(context.handle);
  const rows = await reads.listLayerRows(seeded.owner.scope, seeded.runId, {
    range: { from: timeAt(5), to: timeAt(10) },
    limit: 1_000,
  });
  context.assertCondition(
    rows.length === 5 && rows.every((row, index) => row.candleTime === timeAt(5 + index)),
    `camadas: a faixa [5, 10) deveria ter 5 velas crescentes (${rows.length})`,
  );
  const indicators = rows[0]?.indicators;
  context.assertCondition(
    indicators !== undefined &&
      !Array.isArray(indicators) &&
      JSON.stringify(indicators) ===
        JSON.stringify({ 'risk:atr': null, 'rule:ema-9-21.fast': priceAt(5) }),
    'camadas: as leituras gravadas deveriam voltar como foram gravadas',
  );
  const capped = await reads.listLayerRows(seeded.owner.scope, seeded.runId, {
    range: { from: timeAt(0), to: timeAt(RANGE_END_INDEX) },
    limit: 3,
  });
  context.assertCondition(capped.length === 3, 'camadas: o limite não foi respeitado');
  context.reportCheck(
    'camadas: faixa semiaberta crescente com as leituras gravadas e o limite respeitado',
  );
}

// Previsões (spec 009, T1.2): o resumo SQL com `LEAD` é igual ao oráculo (independente do `src`) nos dois conjuntos reais, a
// lacuna e o fim da faixa viram pendentes, o walk-forward lê só os trechos de limiar pedidos e o dono filtra as três leituras.
// O `make api-runs-mutants` tira cada filtro de dono.
export async function checkProjectionReads(context: LifecycleCheckContext): Promise<void> {
  await checkRealDatasets(context);
  const seeded = await checkSyntheticSummary(context);
  await checkSyntheticItems(context, seeded);
  await checkLayerRows(context, seeded);
  await checkProjectionIsolation(context, seeded);
}
