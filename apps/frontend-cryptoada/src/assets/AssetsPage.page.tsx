// Copyright (c) 2026 Ada Technology. All rights reserved.
import { useState, type ReactElement } from 'react';

import { SelectField, TextField } from '../forms/Fields.component.js';
import { Card } from '../layout/Card.component.js';
import { useStrategiesQuery } from '../strategies/strategy.query.js';
import type { Strategy } from '../strategies/strategy.validation.js';
import runStyles from '../runs/Runs.module.css';
import controls from '../styles/Controls.module.css';
import { AssetCard } from './AssetCard.component.js';
import {
  formatChangePercent,
  formatDecimal,
  formatReais,
  formatSignedDecimal,
} from '../format/format.js';
import { OperationCard } from './OperationCard.component.js';
import styles from './Assets.module.css';
import { useAssetSummaryQuery } from './asset.query.js';
import type { AssetSummary } from './asset.validation.js';
import { useUsdtRate, type UsdtRate } from './useUsdtRate.hook.js';

function Totals({
  summary,
  rate,
}: {
  readonly summary: AssetSummary;
  readonly rate: number | undefined;
}): ReactElement {
  const { totals } = summary;
  const resultRate =
    totals.resultRate === null ? '' : ` (${formatChangePercent(Number(totals.resultRate))})`;
  return (
    <Card title="Resumo">
      <p>
        Total: {formatDecimal(totals.value)} USDT · custo {formatDecimal(totals.cost)} · resultado{' '}
        {formatSignedDecimal(Number(totals.result))}
        {resultRate}
      </p>
      {rate === undefined ? null : <p>Total em R$: {formatReais(Number(totals.value) * rate)}</p>}
      {totals.unpricedAssets === 0 ? null : (
        <p className={controls.muted}>
          {totals.unpricedAssets} ativo(s) ainda sem preço, fora do total.
        </p>
      )}
    </Card>
  );
}

type AssetControlsProps = {
  readonly usdt: UsdtRate;
  readonly strategyId: string;
  readonly strategies: readonly Strategy[];
  readonly onStrategyChange: (strategyId: string) => void;
};

function AssetControls({
  usdt,
  strategyId,
  strategies,
  onStrategyChange,
}: AssetControlsProps): ReactElement {
  const options = strategies.map((strategy) => ({ value: strategy.id, label: strategy.name }));
  return (
    <Card title="Como ler">
      <div className={styles.controls}>
        <TextField
          id="usdt-rate"
          label="Cotação do USDT em R$"
          value={usdt.text}
          onChange={usdt.setText}
        />
        <SelectField
          id="asset-strategy"
          label="Regra do dia pela estratégia"
          value={strategyId}
          options={options}
          onChange={onStrategyChange}
        />
      </div>
      <p className={controls.muted}>
        O painel não busca cotação do dólar: informe a sua para ver os valores em R$. Ela fica
        guardada só neste navegador.
      </p>
    </Card>
  );
}

export function AssetsPage(): ReactElement {
  const [picked, setPicked] = useState('');
  const usdt = useUsdtRate();
  const strategiesQuery = useStrategiesQuery();
  const strategies = strategiesQuery.data ?? [];
  // A regra do dia precisa de uma estratégia: sem escolha vale a primeira da lista.
  const strategyId = picked === '' ? (strategies[0]?.id ?? '') : picked;
  const summary = useAssetSummaryQuery(strategyId, !strategiesQuery.isPending);
  const items = summary.data?.items ?? [];
  return (
    <div className={runStyles.page}>
      <h1 className={runStyles.title}>Seus ativos</h1>
      <AssetControls
        usdt={usdt}
        strategyId={strategyId}
        strategies={strategies}
        onStrategyChange={setPicked}
      />
      {summary.isError ? (
        <p role="alert" className={controls.error}>
          Não foi possível carregar seus ativos. Tente novamente em instantes.
        </p>
      ) : null}
      {summary.data === undefined ? null : <Totals summary={summary.data} rate={usdt.rate} />}
      {summary.isSuccess && items.length === 0 ? (
        <p className={controls.muted}>Nenhum ativo registrado. Registre uma compra abaixo.</p>
      ) : null}
      <div className={styles.list}>
        {items.map((item) => (
          <AssetCard key={item.symbol} item={item} rate={usdt.rate} />
        ))}
      </div>
      <OperationCard />
    </div>
  );
}
